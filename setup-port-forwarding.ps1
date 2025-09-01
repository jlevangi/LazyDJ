# PowerShell script to set up port forwarding for LazyDJ
# Run this as Administrator

# Get the current WSL IP address
$wslIP = (wsl hostname -I).Trim()
Write-Host "WSL IP Address: $wslIP"

# Remove any existing port forwarding rule for port 5021
Write-Host "Removing any existing port forwarding for port 5021..."
netsh interface portproxy delete v4tov4 listenport=5021 listenaddress=0.0.0.0

# Add new port forwarding rule
Write-Host "Adding port forwarding rule: 0.0.0.0:5021 -> $wslIP:5021"
netsh interface portproxy add v4tov4 listenport=5021 listenaddress=0.0.0.0 connectport=5021 connectaddress=$wslIP

# Show current port forwarding rules
Write-Host "Current port forwarding rules:"
netsh interface portproxy show all

# Add Windows Firewall rule to allow incoming connections on port 5021
Write-Host "Adding Windows Firewall rule for port 5021..."
New-NetFirewallRule -DisplayName "LazyDJ Port 5021" -Direction Inbound -LocalPort 5021 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue

Write-Host "Port forwarding setup complete!"
Write-Host "Your LazyDJ application should now be accessible from external networks on port 5021"
