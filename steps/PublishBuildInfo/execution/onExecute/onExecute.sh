PublishBuildInfo() {
  echo "[PublishBuildInfo] Authenticating with integration: $artifactoryIntegrationName"
  local rtUrl=$(eval echo "$"int_"$artifactoryIntegrationName"_url)
  local rtUser=$(eval echo "$"int_"$artifactoryIntegrationName"_user)
  local rtApiKey=$(eval echo "$"int_"$artifactoryIntegrationName"_apikey)
  retry_command jfrog rt config --url $rtUrl --user $rtUser --apikey $rtApiKey --interactive=false

  restore_run_state jfrog /tmp/jfrog

  local buildName="$buildName"
  local buildNumber="$buildNumber"
  if [ -z "$buildName" ] && [ -z "$buildNumber" ]; then
    if [ ! -z "$buildStepName" ]; then
      echo "[push] Using build name and number from build step: $buildStepName"
      buildName=$(eval echo "$""$buildStepName"_buildName)
      buildNumber=$(eval echo "$""$buildStepName"_buildNumber)
    fi
  fi

  local PublishBuildInfo=""
  local envInclude=""
  local envExclude=""
  local scan=false
  local PublishBuildInfoCmd="jfrog rt bp $buildName $buildNumber"

  local stepSetup=$(cat $step_json_path | jq .step.configuration)
  if [ ! -z "$stepSetup" ] && [ "$stepSetup" != "null" ]; then
    local PublishBuildInfo=$(echo $stepSetup | jq .PublishBuildInfo)
    if [ ! -z "$PublishBuildInfo" ] && [ "$PublishBuildInfo" != "null" ]; then
      envInclude=$(echo $PublishBuildInfo | jq -r .envInclude)
      envExclude=$(echo $PublishBuildInfo | jq -r .envExclude)
      scan=$(echo $PublishBuildInfo | jq -r .scan)
    fi
  fi

  if [ ! -z "$envInclude" ] && [ "$envInclude" != "null" ]; then
    PublishBuildInfoCmd="$PublishBuildInfoCmd --env-include $envInclude"
  fi

  if [ ! -z "$envExclude" ] && [ "$envExclude" != "null" ]; then
    PublishBuildInfoCmd="$PublishBuildInfoCmd --env-exclude $envExclude"
  fi

  echo "[PublishBuildInfo] Publishing build info $buildName/$buildNumber"
  retry_command $PublishBuildInfoCmd

  if [ "$scan" == "true" ]; then
    echo "[push] Scanning build $buildName/$buildNumber"
    jfrog rt bs $buildName $buildNumber
  fi

  if [ ! -z "$outputBuildInfoResourceName" ]; then
    echo "[PublishBuildInfo] Updating output resource: $outputBuildInfoResourceName"
    write_output $outputBuildInfoResourceName buildName=$buildName buildNumber=$buildNumber
  fi

  save_run_state /tmp/jfrog/. jfrog
}

execute_command PublishBuildInfo
