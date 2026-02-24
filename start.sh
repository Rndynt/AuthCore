#!/bin/bash
service postgresql start
sleep 2
cd /home/workspace/Realmio
export DATABASE_URL="postgresql://realmio:realmio123@localhost:5432/realmio"
bun run dev
