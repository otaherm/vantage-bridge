#!/bin/bash
while true
do
    cd /home/pi/vantage-bridge
    /usr/local/bin/node main.js
    sleep 2
    echo Restarting vantage-bridge
done