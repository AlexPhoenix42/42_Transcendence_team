# Retention and archiving

The Devops "log management" module requires *"log retention and archiving
policies"*. These three files are that requirement, split the way Elasticsearch
splits it. They are plain JSON with no comments because the ES APIs reject
unknown fields such as `_comment` -- the reasoning therefore lives here.

Applied by `ELK/init/init-elk.sh` on every `up`; all three calls are idempotent.

## `logs-policy.json` -- retention (ILM)

Attached to every `logs-*` index through the `trans-logs` index template.

| Phase | Age | What it does |
|---|---|---|
| hot | 0 | Normal indexing priority. |
| warm | 2d | Force-merge to one segment, mark read-only, lower recovery priority. |
| delete | 7d | Delete the index. |

**No `rollover` action.** Rollover requires a data stream or an index with
`index.lifecycle.rollover_alias`, and this pipeline writes date-named daily
indices (`logs-nginx-2026.09.03`) where the date already does the rolling.
Age-based phases are the correct pairing for that layout. Adding a rollover
action here would simply never fire.

**Why 2d for warm and not 1d.** `min_age` counts from index *creation*. An index
created at 23:00 is one day old at 23:00 the next day, while it stopped being
written at midnight. Two days guarantees writes have stopped before `readonly`
is applied, so ingestion can never hit a read-only write index.

**Why 7 days and not 30.** The VM has a 29 GB disk shared with Postgres, the
Docker images, the restic repo and the ES snapshots. A week of indices fits with
real margin. This is a sizing decision, not a shortcut: the snapshots below keep
30 days of history at a fraction of the size, so nothing is actually lost at day
eight.

## `snapshot-policy.json` -- archiving (SLM)

Snapshots every `logs-*` index to the filesystem repository nightly at 01:30,
keeping 30 days.

Snapshot retention (30d) deliberately **outlives** index retention (7d). That is
what makes this archiving rather than a second copy of live data: an index is
captured several nights over before ILM deletes it, and the archive remains
readable for three more weeks.

`include_global_state: false` keeps cluster settings and security data out of
the log archive -- restoring an old log snapshot must never roll back the
cluster's users or settings.

## `repository.json` -- where archives go

A filesystem repository at `/snapshots` in the container, bind-mounted from
`$HOME/goinfre/trans_data/trans_es_snapshots` on the host. `path.repo` in
`elasticsearch.yml` must list this path or ES refuses to register the
repository.

**Why not beside the restic repo under `trans_backups/`,** which would have
matched the project's existing backup convention: `up_dep_secure.sh` runs
`chown -R 100:100` and `chmod 750` across that entire tree to set up the restic
repository. Elasticsearch runs as uid 1000, so every invocation of that script
would silently take the snapshot directory away from ES, and the next SLM run
would fail with `access_denied_exception`. That is not hypothetical -- it is
exactly how this was discovered. A separate directory is immune to it.

## Verifying

    GET _ilm/policy/trans-logs-retention
    GET _slm/policy/trans-logs-snapshots
    POST _slm/policy/trans-logs-snapshots/_execute   # forces a snapshot now
    GET _snapshot/trans-log-snapshots/_all

The last one should list a `logs-snap-<date>` snapshot in state `SUCCESS`, and
the files behind it appear under the host path above.
