#!/bin/bash

NAME='foreca-import'

cd "$(dirname "${BASH_SOURCE[0]}")"

[[ $(docker images | grep "$NAME" | wc -l) -eq 0 ]] && docker build -t "$NAME" .

docker run --rm -i -v `pwd`/archive/:/data/archive/ foreca-import >> ./import.log
