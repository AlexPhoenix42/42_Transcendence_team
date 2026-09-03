FROM		docker.io/library/logstash:9.5.2

# Drop the image's sample pipeline so only our config is loaded.
RUN			rm -f /usr/share/logstash/pipeline/logstash.conf

# Baked in, same convention as the elasticsearch and kibana images.
COPY		docker_conf/logstash.yml	/usr/share/logstash/config/logstash.yml
COPY		docker_conf/pipelines.yml	/usr/share/logstash/config/pipelines.yml
COPY		docker_conf/logstash.conf	/usr/share/logstash/pipeline/logstash.conf

# 12201/udp: Docker gelf driver input.  9600/tcp: Logstash monitoring API.
EXPOSE		12201/udp 9600
