# Broker UI Configuration Fix

## Problem

The UI would lose connection to the broker after broker redeployment, requiring a UI pod restart.

## Root Cause

1. NGINX resolved DNS at startup and cached the IP address
2. When the broker service was recreated, the ClusterIP changed
3. NGINX continued using the old cached IP, causing 502/504 errors

## Solution

Updated `nginx.conf.template` to:

1. Add DNS resolver directive: `resolver 10.96.0.10 valid=5s`
2. Use variables in `proxy_pass` to force DNS re-resolution
3. Changed backend URL to use direct service instead of ExternalName

## Required Helm Values Update

Update your helm values file to use the direct service URL:

```yaml
env:
  API_URL: 'http://pg-plus-broker.default.svc.cluster.local:1771'
  NGINX_HOST: 'localhost'
  NGINX_PORT: '80'
```

**Change:** `http://broker-gateway` → `http://pg-plus-broker.default.svc.cluster.local:1771`

## Why This Works

- `pg-plus-broker` ClusterIP is stable (doesn't change unless service is deleted)
- The full FQDN `pg-plus-broker.default.svc.cluster.local` ensures proper DNS resolution
- NGINX resolver re-resolves DNS every 5 seconds to pick up endpoint changes
- Kubernetes handles routing from ClusterIP to pod IPs automatically

## Optional: Remove broker-gateway Service

The `broker-gateway` ExternalName service is no longer needed and can be deleted:

```bash
kubectl delete svc broker-gateway
```

## Deployment

After updating helm values and the new Docker image is built (with updated nginx.conf.template), deploy normally. The UI will now survive broker redeployments without requiring restarts.
