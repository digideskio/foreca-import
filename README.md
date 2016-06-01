# Foreca forecast import

> Import Foreca weather forecasts into MySQL database.

## Setup

```bash
git clone https://github.com/kukua/foreca-import.git
cd foreca-import
cp .env.example .env
chmod 600 .env
# > Edit .env
ln -s ../concava-setup-mysql-mqtt/.env concava.env

sudo cp ./cronjob /etc/cron.d/foreca-import
sudo service cron reload
```

## License

This software is licensed under the [MIT license](https://github.com/kukua/foreca-import/blob/master/LICENSE).

© 2016 Kukua BV
