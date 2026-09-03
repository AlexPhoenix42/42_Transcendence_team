# Vault policy for the ELK stack.
#
# Read-only, single path. The AppRole bound to this policy can fetch the
# Elasticsearch/Kibana/Logstash credentials and nothing else -- it cannot read
# the django, database or oauth secrets that Trans-policy grants, and it cannot
# write anywhere.
path "secret/data/elasticsearch" {
  capabilities = ["read"]
}
