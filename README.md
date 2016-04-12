# Foreca forecast import

> Import Foreca weather forecasts into MySQL database.

## Setup

```bash
git clone https://github.com/kukua/foreca-import.git
cd foreca-import
cp .env.sample .env
chmod 600 .env
# > Edit .env
ln -s ../concava-setup-mysql-mqtt/.env concava.env

sudo cp ./cronjob /etc/cron.d/foreca-import
sudo service cron reload
```
