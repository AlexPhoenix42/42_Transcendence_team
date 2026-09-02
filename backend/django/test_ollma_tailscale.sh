#!/usr/bin/env bash

curl http://100.121.36.55:11434/api/chat -d '{
	"model"		: "mistral",
	"messages"	: [{"role": "user", "content": "What is the Sicilian Defence?"}],
	"stream"	: false
}'

