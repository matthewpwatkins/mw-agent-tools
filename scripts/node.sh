#!/bin/sh
# Runs a plugin script with a Node.js new enough to run TypeScript directly (22.18 or newer), found without relying on PATH.
#   sh node.sh <script.ts> [args...]
#
# Hooks run with whatever PATH the agent was started with, and an agent started by a service, a scheduler or a restart often has
# a short one that leaves out nvm, fnm, volta, asdf, mise or Homebrew. So this looks in each of those places too, newest first.
# MW_AGENT_TOOLS_NODE, when set, is tried before anything else; MW_AGENT_TOOLS_SYSTEM_DIRS replaces the system folders searched last.
#
# When no suitable Node is found it says so once, on stderr with exit 1 (a non-blocking hook error the user sees), then stays
# quiet so it does not repeat on every hook. Finding one again re-arms the warning.
#
# Generated copies live in each plugin's scripts folder; edit scripts/node.sh at the repo root and run `npm run sync`.

MIN_MAJOR=22
MIN_MINOR=18

# ok <node>: true when <node> runs and is at least MIN_MAJOR.MIN_MINOR.
ok() {
    [ -x "$1" ] || return 1
    v=$("$1" -p 'process.versions.node' 2>/dev/null) || return 1
    major=${v%%.*}; rest=${v#*.}; minor=${rest%%.*}
    case "$major$minor" in '' | *[!0-9]*) return 1 ;; esac
    [ "$major" -gt "$MIN_MAJOR" ] || { [ "$major" -eq "$MIN_MAJOR" ] && [ "$minor" -ge "$MIN_MINOR" ]; }
}

# newest <path>...: prints the paths that exist, one a line, highest version first.
newest() {
    list=$(for p in "$@"; do [ -e "$p" ] && printf '%s\n' "$p"; done)
    [ -n "$list" ] || return 0
    printf '%s\n' "$list" | sort -V -r 2>/dev/null || printf '%s\n' "$list" | sort -r
}

# candidates: every place a Node may be, one a line, in the order to try them.
candidates() {
    h=${HOME:-}
    data=${XDG_DATA_HOME:-$h/.local/share}
    [ -n "${MW_AGENT_TOOLS_NODE:-}" ] && printf '%s\n' "$MW_AGENT_TOOLS_NODE"
    command -v node 2>/dev/null
    [ -n "${NVM_BIN:-}" ] && printf '%s\n' "$NVM_BIN/node"
    newest "${NVM_DIR:-$h/.nvm}"/versions/node/v*/bin/node
    newest "${FNM_DIR:-$data/fnm}"/node-versions/v*/installation/bin/node "$h/Library/Application Support/fnm/node-versions"/v*/installation/bin/node
    printf '%s\n' "$h/.volta/bin/node"
    newest "${ASDF_DATA_DIR:-$h/.asdf}"/installs/nodejs/*/bin/node
    newest "$data"/mise/installs/node/*/bin/node
    [ -n "${N_PREFIX:-}" ] && printf '%s\n' "$N_PREFIX/bin/node"
    printf '%s\n' "$h/.local/bin/node"
    for d in ${MW_AGENT_TOOLS_SYSTEM_DIRS-/opt/homebrew/bin /usr/local/bin /usr/bin /bin}; do printf '%s\n' "$d/node"; done
}

find_node() {
    nl='
'
    old_ifs=$IFS; IFS=$nl
    for n in $(candidates); do
        IFS=$old_ifs
        ok "$n" && { printf '%s\n' "$n"; return 0; }
    done
    IFS=$old_ifs
    return 1
}

state=${XDG_STATE_HOME:-${HOME:-/tmp}/.local/state}/mw-agent-tools
warned=$state/no-node

if node=$(find_node); then
    rm -f "$warned" 2>/dev/null
    exec "$node" "$@"
fi

[ -e "$warned" ] && exit 0
mkdir -p "$state" 2>/dev/null && : > "$warned" 2>/dev/null
echo "mw-agent-tools: no Node.js ${MIN_MAJOR}.${MIN_MINOR} or newer found (looked on PATH and in nvm, fnm, volta, asdf, mise and Homebrew)," \
    "so ${1##*/} did not run. Install one, or set MW_AGENT_TOOLS_NODE to its path. This warning shows once." >&2
exit 1
