FROM		docker.io/library/elasticsearch:9.5.2

# Bake the node config into the image rather than bind-mounting it, matching how
# frontend/docker_conf/Dockerfile bakes in nginx-dep.conf. Keeps the running
# container's config identical to what is committed.
COPY		docker_conf/elasticsearch.yml \
			/usr/share/elasticsearch/config/elasticsearch.yml

EXPOSE		9200
