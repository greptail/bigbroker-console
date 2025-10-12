#!/bin/sh

# Set default API_URL if not provided
: "${API_URL:=http://localhost:1772}"

# Export API_URL for envsubst
export API_URL

# Substitute environment variables in the nginx template
envsubst '${API_URL}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

# Start nginx
exec "$@"