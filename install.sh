#!/bin/bash

sudo apt update

# nginx
sudo apt install -y nginx
sudo ufw allow 'Nginx Full'
sudo systemctl enable nginx
sudo systemctl start nginx
# sudo systemctl status nginx
sudo mv conf/nginx.conf /etc/nginx/sites-enabled/default
sudo systemctl restart nginx

# mongodb
curl -fsSL https://www.mongodb.org/static/pgp/server-4.4.asc | sudo apt-key add -
apt-key list
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/4.4 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-4.4.list
sudo apt update
sudo apt install -y mongodb-org
sudo systemctl enable mongod
sudo systemctl start mongod.service
# sudo systemctl status mongod
mongo --eval 'db.runCommand({ connectionStatus: 1 })'

# node.js
curl -sL https://deb.nodesource.com/setup_16.x -o /tmp/nodesource_setup.sh
sudo bash /tmp/nodesource_setup.sh
sudo apt install nodejs

# install pm2
sudo npm install -g pm2

# install node.js packages
npm install

# rename env 
mv src/config/env.example.ts src/config/env.ts 

# start service
pm2 start 

# register pm2 services
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp $HOME
pm2 save
