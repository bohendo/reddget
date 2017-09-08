#!/bin/bash

node /home/bo/Documents/projects/reddget/reddget.js $1

if [ $1 != "prep" ]; then
  n=`ls -1 ~/i | sort -r | head -n1 | cut -c 1-2`
  more /home/bo/i/$n* | fold -s -w 140 | less
fi
