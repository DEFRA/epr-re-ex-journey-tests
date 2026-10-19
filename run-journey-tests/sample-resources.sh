#!/usr/bin/env bash
set -u

sample() {
  while true; do
    echo "--- $(date -u +%T) $(cat /proc/loadavg)"
    docker stats --no-stream --format "ctr {{.Name}} cpu={{.CPUPerc}} mem={{.MemUsage}}"
    top -b -n2 -d1 -w256 | awk '
      /^top -/ { n++ }
      n == 2 && $1 ~ /^[0-9]+$/ { cpu[$12] += $9 }
      END { for (name in cpu) printf "proc %s cpu=%.1f%%\n", name, cpu[name] }'
    sleep 15
  done
}

summarise() {
  file=$1
  echo "cpus=$(nproc) $(grep -m1 'model name' /proc/cpuinfo)"
  awk '/^---/ { n++; s += $3; if ($3 > m) m = $3 }
       END { if (n) printf "samples=%d load1 avg=%.1f max=%.1f\n", n, s / n, m }' "$file"
  echo "busiest processes (cpu%, 100 = one core, summed per command, averaged per sample)"
  awk '/^---/ { n++ }
       /^proc / { split($3, kv, "="); sub("%", "", kv[2]); cpu[$2] += kv[2] }
       END { for (name in cpu) printf "%8.1f %s\n", cpu[name] / n, name }' "$file" | sort -rn | head -8
}

case "${1:-}" in
  sample) sample ;;
  summary) summarise "$2" ;;
  *) echo "usage: $0 sample | summary <file>" >&2; exit 2 ;;
esac
