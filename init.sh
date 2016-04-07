#!/bin/bash

DIR=`cd "$(dirname "${BASH_SOURCE[0]}")" && pwd`

source $DIR/.env
source $DIR/concava.env

echo "CREATE DATABASE IF NOT EXISTS \`$MYSQL_FORECAST_DATABASE\`; \
	GRANT ALL ON \`$MYSQL_FORECAST_DATABASE\`.* TO '$MYSQL_USER'@'%'; \
	FLUSH PRIVILEGES;" | \
	docker exec -i concavasetupmysqlmqtt_mariadb_1 \
	mysql -uroot -p"$MYSQL_ROOT_PASSWORD"
