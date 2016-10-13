FROM node:5.11
MAINTAINER Kukua Team <dev@kukua.cc>

WORKDIR /data
ADD package.json /data/
RUN npm install
ADD ./ /data/
RUN npm run compile
RUN npm prune --production

CMD npm start
