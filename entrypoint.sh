#!/bin/sh
set -e

# Set default API_URL if not provided
: "${API_URL:=localhost:1772}"

export API_URL

envsubst '${API_URL}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

exec "$@"