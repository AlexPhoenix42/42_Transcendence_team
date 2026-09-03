#!/bin/sh
# One-shot Elasticsearch bootstrap, run by the `elk-init` service on every `up`.
# Everything here must be idempotent -- it re-runs on every stack restart.
#
# Modelled on the existing vault-init service: a throwaway container that
# configures a dependency and exits 0, gated by
# `depends_on: { condition: service_completed_successfully }`.
#
# Build step 9 extends this with the ILM and SLM policies from ELK/ilm/.
set -eu

ES="http://elasticsearch:9200"
AUTH="elastic:${ELASTIC_PASSWORD}"

echo "==> Waiting for Elasticsearch to accept requests"
# depends_on already waits for the healthcheck; this covers the gap between
# "healthy" and "security index writable", which is not the same instant.
i=0
until curl -sf -u "${AUTH}" "${ES}/_cluster/health?wait_for_status=yellow&timeout=5s" >/dev/null 2>&1; do
	i=$((i + 1))
	if [ "${i}" -gt 40 ]; then
		echo "FAIL: Elasticsearch did not become reachable in time" >&2
		exit 1
	fi
	sleep 3
done
echo "    Elasticsearch is up"

echo "==> Setting the kibana_system password"
# The built-in kibana_system account ships with no password. Setting it via the
# API (rather than baking it into the image) keeps it out of the repo, and the
# call is a plain overwrite, so re-running is harmless.
code=$(curl -s -o /tmp/pw.out -w '%{http_code}' \
	-u "${AUTH}" \
	-X POST "${ES}/_security/user/kibana_system/_password" \
	-H 'Content-Type: application/json' \
	-d "{\"password\":\"${KIBANA_SYSTEM_PASSWORD}\"}")

if [ "${code}" != "200" ]; then
	echo "FAIL: setting kibana_system password returned HTTP ${code}" >&2
	cat /tmp/pw.out >&2
	exit 1
fi
echo "    kibana_system password set"

echo "==> Applying retention and archiving policies"
# See ELK/ilm/README.md for why the policy is shaped this way (no rollover
# action, 2d warm, 7d delete, 30d snapshot retention). All three calls are
# plain upserts, so this re-runs on every `up` without side effects.
apply_json() {
	_what="$1"; _method="$2"; _path="$3"; _file="$4"
	_code=$(curl -s -o /tmp/apply.out -w '%{http_code}' \
		-u "${AUTH}" -X "${_method}" "${ES}${_path}" \
		-H 'Content-Type: application/json' \
		--data-binary "@${_file}")
	if [ "${_code}" != "200" ]; then
		echo "FAIL: ${_what} returned HTTP ${_code}" >&2
		cat /tmp/apply.out >&2
		exit 1
	fi
	echo "    ${_what}"
}

# Repository first: the SLM policy refers to it by name and will not validate
# against a repository that does not exist yet.
apply_json "snapshot repository trans-log-snapshots" \
	PUT "/_snapshot/trans-log-snapshots" /app/ilm/repository.json

apply_json "ILM policy trans-logs-retention" \
	PUT "/_ilm/policy/trans-logs-retention" /app/ilm/logs-policy.json

apply_json "SLM policy trans-logs-snapshots" \
	PUT "/_slm/policy/trans-logs-snapshots" /app/ilm/snapshot-policy.json

echo "==> Installing the logs-* index template"
# Installed here rather than letting Logstash manage a template, so the index
# settings live in the repo and Logstash needs no template privileges.
# auto_expand_replicas keeps a one-node cluster green (see the note below).
code=$(curl -s -o /tmp/tpl.out -w '%{http_code}' \
	-u "${AUTH}" -X PUT "${ES}/_index_template/trans-logs" \
	-H 'Content-Type: application/json' \
	-d '{
		"index_patterns": ["logs-*"],
		"priority": 200,
		"template": {
			"settings": {
				"number_of_shards": 1,
				"auto_expand_replicas": "0-1",
				"refresh_interval": "5s",
				"index.lifecycle.name": "trans-logs-retention"
			},
			"mappings": {
				"properties": {
					"@timestamp":       { "type": "date" },
					"container_name":   { "type": "keyword" },
					"level":            { "type": "keyword" },
					"logger":           { "type": "keyword" },
					"stream":           { "type": "keyword" },
					"message":          { "type": "text" },
					"log_kind":         { "type": "keyword" },

					"client_ip":        { "type": "keyword" },
					"http_method":      { "type": "keyword" },
					"request_path":     { "type": "keyword" },
					"status":           { "type": "integer" },
					"body_bytes":       { "type": "long" },
					"user_agent":       { "type": "keyword" },
					"referrer":         { "type": "keyword" },

					"rule_ids":         { "type": "keyword" },
					"rule_severities":  { "type": "keyword" },
					"rule_hit_count":   { "type": "integer" },
					"modsec_timestamp": { "type": "keyword" }
				}
			}
		}
	}')
if [ "${code}" != "200" ]; then
	echo "FAIL: index template returned HTTP ${code}" >&2
	cat /tmp/tpl.out >&2
	exit 1
fi
echo "    template trans-logs installed"

echo "==> Creating the Logstash ingest role and user"
# Least privilege on purpose: Logstash may create and write logs-* indices and
# nothing else. It cannot read application data, delete indices, or touch
# cluster settings, so a compromised pipeline cannot pivot into the cluster.
code=$(curl -s -o /tmp/role.out -w '%{http_code}' \
	-u "${AUTH}" -X PUT "${ES}/_security/role/logstash_writer" \
	-H 'Content-Type: application/json' \
	-d '{
		"cluster": ["monitor"],
		"indices": [{
			"names": ["logs-*"],
			"privileges": ["create_index", "write", "view_index_metadata"]
		}]
	}')
if [ "${code}" != "200" ]; then
	echo "FAIL: role creation returned HTTP ${code}" >&2
	cat /tmp/role.out >&2
	exit 1
fi

# PUT on a user is an upsert, so this re-runs cleanly and also re-syncs the
# password if ELK/.env.elk was regenerated.
code=$(curl -s -o /tmp/user.out -w '%{http_code}' \
	-u "${AUTH}" -X PUT "${ES}/_security/user/logstash_internal" \
	-H 'Content-Type: application/json' \
	-d "{
		\"password\": \"${LOGSTASH_PASSWORD}\",
		\"roles\": [\"logstash_writer\"],
		\"full_name\": \"Logstash ingest (ft_transcendence)\"
	}")
if [ "${code}" != "200" ]; then
	echo "FAIL: user creation returned HTTP ${code}" >&2
	cat /tmp/user.out >&2
	exit 1
fi
echo "    logstash_internal / logstash_writer ready"

echo "==> Attaching the ILM policy to pre-existing logs-* indices"
# The template only affects indices created after it. Any logs-* index that
# predates this policy would otherwise live forever, so adopt them explicitly.
code=$(curl -s -o /tmp/adopt.out -w '%{http_code}' \
	-u "${AUTH}" -X PUT "${ES}/logs-*/_settings" \
	-H 'Content-Type: application/json' \
	-d '{"index.lifecycle.name":"trans-logs-retention"}')
case "${code}" in
	200) echo "    existing logs-* indices adopted" ;;
	404) echo "    no logs-* indices yet, nothing to adopt" ;;
	*)   echo "FAIL: adopting existing indices returned HTTP ${code}" >&2
	     cat /tmp/adopt.out >&2; exit 1 ;;
esac

echo "==> Collapsing unassignable replicas"
# On a one-node cluster any index created with 1 replica leaves that replica
# permanently UNASSIGNED, which drags cluster health to yellow forever. Kibana
# installs a couple of such indices for its alerting internals (.rule-events,
# .alert-actions), so the cluster goes yellow the first time Kibana boots even
# though nothing is wrong.
#
# `auto_expand_replicas: 0-1` is the canonical single-node answer: ES uses 0
# replicas while there is one node and automatically promotes to 1 if a second
# node ever joins -- unlike hard-setting replicas to 0, which would silently
# stay unreplicated on a real cluster.
#
# Discovered dynamically rather than hardcoding index names, so this also covers
# indices that appear after a rollover or a Kibana upgrade. Re-runs harmlessly.
UNASSIGNED=$(curl -s -u "${AUTH}" "${ES}/_cat/shards?h=index,prirep,state" \
	| awk '$2 == "r" && $3 == "UNASSIGNED" { print $1 }' | sort -u)

if [ -z "${UNASSIGNED}" ]; then
	echo "    none"
else
	for idx in ${UNASSIGNED}; do
		code=$(curl -s -o /dev/null -w '%{http_code}' \
			-u "${AUTH}" -X PUT "${ES}/${idx}/_settings" \
			-H 'Content-Type: application/json' \
			-d '{"index.auto_expand_replicas":"0-1"}')
		echo "    ${idx} -> auto_expand_replicas 0-1 (HTTP ${code})"
	done
fi

echo
echo "OK: Elasticsearch bootstrap complete."
