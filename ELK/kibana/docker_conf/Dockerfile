FROM		docker.io/library/kibana:9.5.2

# Bake the config in, same convention as the elasticsearch and frontend images.
COPY		docker_conf/kibana.yml \
			/usr/share/kibana/config/kibana.yml

EXPOSE		5601
