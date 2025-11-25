#!/bin/bash

# Comprehensive site diagnostics script

echo "================================================="
echo "SITE DIAGNOSTICS"
echo "================================================="
echo ""

# Check backend health
echo "1. Testing Backend Health (localhost:8000)..."
BACKEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/health 2>/dev/null || echo "FAILED")
if [ "$BACKEND_STATUS" = "200" ]; then
    echo "   ✅ Backend is responding (HTTP 200)"
else
    echo "   ❌ Backend NOT responding (got: $BACKEND_STATUS)"
fi
echo ""

# Check if ports are listening
echo "2. Checking Open Ports..."
if command -v netstat &> /dev/null; then
    echo "   Port 80:  $(netstat -tlnp 2>/dev/null | grep ':80 ' || echo 'NOT LISTENING')"
    echo "   Port 443: $(netstat -tlnp 2>/dev/null | grep ':443 ' || echo 'NOT LISTENING')"
elif command -v ss &> /dev/null; then
    echo "   Port 80:  $(ss -tlnp 2>/dev/null | grep ':80 ' || echo 'NOT LISTENING')"
    echo "   Port 443: $(ss -tlnp 2>/dev/null | grep ':443 ' || echo 'NOT LISTENING')"
fi
echo ""

# Test HTTP access
echo "3. Testing HTTP Access (port 80)..."
HTTP_TEST=$(curl -s -o /dev/null -w "%{http_code}" http://localhost 2>/dev/null || echo "FAILED")
echo "   HTTP response: $HTTP_TEST"
echo ""

# Test HTTPS access (ignoring cert errors)
echo "4. Testing HTTPS Access (port 443)..."
HTTPS_TEST=$(curl -k -s -o /dev/null -w "%{http_code}" https://localhost 2>/dev/null || echo "FAILED")
echo "   HTTPS response: $HTTPS_TEST"
echo ""

# Check container status
echo "5. Container Status..."
docker compose ps
echo ""

# Check Caddy access logs
echo "6. Recent Caddy Logs (last 10 lines)..."
docker compose logs caddy --tail=10
echo ""

# Check backend logs
echo "7. Recent Backend Logs (last 10 lines)..."
docker compose logs backend --tail=10
echo ""

echo "================================================="
echo "TESTING ACTUAL DOMAIN"
echo "================================================="
echo ""

# Test domain resolution
echo "8. DNS Resolution for 311.westwindsorforward.org..."
if command -v dig &> /dev/null; then
    dig +short 311.westwindsorforward.org | head -5
elif command -v nslookup &> /dev/null; then
    nslookup 311.westwindsorforward.org | grep "Address:" | tail -1
else
    echo "   (dig/nslookup not available)"
fi
echo ""

# Get public IP
echo "9. This Server's Public IP..."
curl -s https://api.ipify.org 2>/dev/null || curl -s http://ifconfig.me 2>/dev/null || echo "Could not determine"
echo ""

echo "================================================="
echo "RECOMMENDATIONS"
echo "================================================="
echo ""
echo "If backend shows ✅ but site doesn't load:"
echo "  - Check firewall: sudo ufw status"
echo "  - Check security groups in your cloud provider"
echo "  - Verify Cloudflare DNS points to correct IP"
echo ""
echo "If backend shows ❌:"
echo "  - Check backend logs: docker compose logs backend --tail=50"
echo "  - Check database: docker compose logs db --tail=20"
echo ""
