# Foreca Import

> Import Foreca weather forecasts into InfluxDB.

## Installation

```bash
git clone https://github.com/kukua/foreca-import.git
cd foreca-import
npm install
cp .env.sample .env
# > Edit .env

docker-compose up -d

# Add cronjob
sudo su -
echo -e '#!/bin/bash\n\n/data/foreca-import/run.sh' > /etc/cron.hourly/foreca-import
chmod +x /etc/cron.hourly/foreca-import
/etc/cron.hourly/foreca-import # Test cronjob script, should output lines with 'npm info'
exit # Leave root
```
