#!/bin/bash
set -e

echo "Building Docker sandbox images..."

docker build -t python:3.9-custom ./docker/python/
docker build -t node:18-custom ./docker/node/
docker build -t eclipse-temurin:11-custom ./docker/java/
docker build -t gcc:latest-custom ./docker/c/

echo ""
echo "All images built successfully."
echo ""
echo "Images:"
docker images | grep -E "python:3.9-custom|node:18-custom|eclipse-temurin:11-custom|gcc:latest-custom"
