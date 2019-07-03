post_webhook_url() {
  local resourceName="$1"
  local integrationAlias=$(eval echo "$"res_"$resourceName"_integrationAlias)
  local resourcePath=$(eval echo "$"res_"$resourceName"_resourcePath)
  local intMasterName=$(eval echo "$"res_"$resourceName"_"$integrationAlias"_masterName)
  local filePath=$resourcePath/$resourceName.env

  if [ "$intMasterName" == "externalWebhook" ]; then
    if [ -s $filePath ]; then
      local webhookURL=$(eval echo "$"res_"$resourceName"_"$integrationAlias"_webhookURL)
      local authorization=$(eval echo "$"res_"$resourceName"_"$integrationAlias"_authorization)
      local data="{}"

      while read -r line; do
        key="$(awk -F'=' '{print $1}' <<<"$line")"
        value="$(awk -F'=' '{print $2}' <<<"$line")"
        value=$(echo "$value" | sed "s/\"/\\\\\"/g")
        data=$(echo $data | jq ". + {$key: \"$value\"}")
      done < $filePath

      curl -X POST \
        -H  "Authorization: $authorization" \
        -H "Content-Type: application/json" --data "$data" \
        $webhookURL
    fi
  fi
}

execute_command "post_webhook_url %%context.resourceName%%"
