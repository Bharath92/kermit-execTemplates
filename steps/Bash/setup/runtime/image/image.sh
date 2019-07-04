boot_container() {
  wait_for_exit() {
    local exit_code=$(docker wait $DOCKER_CONTAINER_NAME)

    if [ $exit_code -ne 0 ]; then
      start_group "Container exit code"
      execute_command "echo \"Container exited with exit_code: $exit_code\""
      stop_group
    fi

    exit $exit_code
  }

  local dockerRegistry="%%context.registry%%"
  local image_autopull="%%context.autoPull%%"
  local pullCommand="docker pull $DOCKER_IMAGE"
  configure_registry_credentials() {
    local intMasterName=$(eval echo "$"int_"$dockerRegistry"_masterName)

    if [ "$intMasterName" == "dockerRegistryLogin" ]; then
      local userName=$(eval echo "$"int_"$dockerRegistry"_username)
      local password=$(eval echo "$"int_"$dockerRegistry"_password)
      local url=$(eval echo "$"int_"$dockerRegistry"_url)

      retry_command docker login -u "$userName" -p "$password" "$url"
    elif [ "$intMasterName" == "amazonKeys" ]; then
      local accessKeyId=$(eval echo "$"int_"$dockerRegistry"_accessKeyId)
      local secretAccessKey=$(eval echo "$"int_"$dockerRegistry"_secretAccessKey)
      local region="%%context.region%%"

      export SETUP_AWS_SHARED_CREDENTIALS="$step_workspace_dir/$dockerRegistry"/.aws/credentials
      export SETUP_AWS_CONFIG="$step_workspace_dir/$dockerRegistry"/.aws/config

      aws configure set aws_access_key_id "$accessKeyId"
      aws configure set aws_secret_access_key "$secretAccessKey"
      aws configure set region "$region"

      retry_command $(aws ecr get-login --no-include-email)
    elif [ "$intMasterName" == "gcloudKey" ]; then
      local jsonKey=$(eval echo "$"int_"$dockerRegistry"_jsonKey)
      local projectId="$( echo "$jsonKey" | jq -r '.project_id' )"

      mkdir -p $step_tmp_dir/$dockerRegistry
      local keyFile="$step_tmp_dir/$dockerRegistry/$dockerRegistry.json"
      touch $keyFile
      echo "$jsonKey" > $keyFile
      gcloud -q auth activate-service-account --key-file "$keyFile"
      gcloud config set project "$projectId"
      gcloud docker -a
    elif [ "$intMasterName" == "artifactory" ]; then
      local url=$(eval echo "$"int_"$dockerRegistry"_url)
      local user=$(eval echo "$"int_"$dockerRegistry"_user)
      local apiKey=$(eval echo "$"int_"$dockerRegistry"_apikey)
      local sourceRepository="%%context.sourceRepository%%"

      jfrog rt config --url "$url" --user "$user" --apikey "$apiKey" --interactive=false $dockerRegistry
      jfrog rt use $dockerRegistry
      pullCommand="jfrog rt docker-pull $DOCKER_IMAGE $sourceRepository"
    fi
  }

  cleanup_registry_credentials() {
    local intMasterName=$(eval echo "$"int_"$dockerRegistry"_masterName)
    if [ "$intMasterName" == "dockerRegistryLogin" ]; then
      local url=$(eval echo "$"int_"$dockerRegistry"_url)
      docker logout "$url"
    elif [ "$intMasterName" == "amazonKeys" ]; then
      local region="%%context.region%%"
      local awsAccountId=$(aws sts get-caller-identity --query 'Account' --output text)
      unset SETUP_AWS_SHARED_CREDENTIALS
      unset SETUP_AWS_CONFIG
      if [ -f $step_workspace_dir/$dockerRegistry/.aws/credentials ]; then
        rm "$step_workspace_dir/$dockerRegistry"/.aws/credentials
      fi
      if [ -f $step_workspace_dir/$dockerRegistry/.aws/config ]; then
        rm "$step_workspace_dir/$dockerRegistry"/.aws/config
      fi
      docker logout "$awsAccountId.dkr.ecr.$region.amazonaws.com"
    elif [ "$intMasterName" == "gcloudKey" ]; then
      local jsonKey=$(eval echo "$"int_"$dockerRegistry"_jsonKey)
      local email="$( echo "$jsonKey" | jq -r '.client_email' )"
      gcloud auth revoke $email
      if [ -f $step_tmp_dir/$dockerRegistry/$dockerRegistry.json ]; then
        rm $step_tmp_dir/$dockerRegistry/$dockerRegistry.json
      fi

      docker logout gcr.io
      docker logout eu.gcr.io
      docker logout us.gcr.io
      docker logout asia.gcr.io
      docker logout marketplace.gcr.io
      docker logout staging-k8s.gcr.io
    elif [ "$intMasterName" == "artifactory" ]; then
      jfrog rt config delete $dockerRegistry --interactive=false
    fi
  }

  start_group "Booting Container"
  if [ ! -z "$dockerRegistry" ]; then
    execute_command configure_registry_credentials
  fi
  if [ "$image_autopull" == "true" ]; then
    execute_command "$pullCommand"
  fi

  local default_docker_options="-v /opt/docker/docker:/usr/bin/docker \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v $run_dir:$run_dir \
    -v $pipeline_workspace_dir:$pipeline_workspace_dir \
    -v $reqexec_dir:$reqexec_dir \
    -w $(pwd) -d --init --rm --privileged --name $DOCKER_CONTAINER_NAME"
  local docker_run_cmd="docker run $DOCKER_CONTAINER_OPTIONS $default_docker_options \
    -e running_in_container=$running_in_container \
    $DOCKER_IMAGE \
    bash -c \"$reqexec_bin_path $steplet_script_path steplet.env\""

  execute_command "$docker_run_cmd"

  if [ ! -z "$dockerRegistry" ]; then
    execute_command cleanup_registry_credentials
  fi
  stop_group

  wait_for_exit
}

if [ -z $running_in_container ]; then
  export running_in_container=false;
fi
if ! $running_in_container; then
  export DOCKER_IMAGE="%%context.imageName%%:%%context.imageTag%%"
  export DOCKER_CONTAINER_OPTIONS="%%context.containerOptions%%"
  export DOCKER_CONTAINER_NAME="$step_docker_container_name"
  skip_before_exit_methods=true
  running_in_container=true
  boot_container
fi
