#!/usr/bin/env bash
#
# Encodes the originals in audio-src/ into the assets the game actually ships.
#
# AAC rather than MP3: at these bitrates Apple's encoder is well ahead of any
# MP3 encoder, and every browser's decodeAudioData handles it. Effects collapse
# to mono because none of them are positioned — stereo would double their size
# and their decoded memory for no audible difference. The music stays stereo,
# since a background bed is the one place the width is worth paying for.
#
# Usage: scripts/encode-audio.sh
set -euo pipefail
cd "$(dirname "$0")/.."

SRC=audio-src
OUT=public/assets/audio
mkdir -p "$OUT"

MUSIC_BITRATE=80000
SFX_BITRATE=64000

encode() { # name, bitrate, "mono" | "stereo"
  local name=$1 bitrate=$2 mode=$3
  local input="$SRC/$name.mp3" output="$OUT/$name.m4a"
  local tmp; tmp=$(mktemp -t "$name").wav

  if [ "$mode" = mono ]; then
    afconvert -f WAVE -d LEI16@44100 --mix -l Mono "$input" "$tmp"
  else
    afconvert -f WAVE -d LEI16@44100 "$input" "$tmp"
  fi
  # -s 2 is constrained VBR: holds the target without CBR's wasted bits.
  afconvert -f m4af -d aac -b "$bitrate" -s 2 "$tmp" "$output"
  rm -f "$tmp"

  printf "  %-8s %7s B -> %7s B  (%s, %sk %s)\n" \
    "$name" "$(stat -f%z "$input")" "$(stat -f%z "$output")" \
    "$(afinfo "$output" | sed -n 's/.*Data format: *\([0-9]*\) ch.*/\1ch/p')" \
    "$((bitrate / 1000))" "$mode"
}

echo "encoding audio"
encode music "$MUSIC_BITRATE" stereo
for f in place menu sell pop shot leak; do encode "$f" "$SFX_BITRATE" mono; done

before=$(cat "$SRC"/*.mp3 | wc -c | tr -d ' ')
after=$(cat "$OUT"/*.m4a | wc -c | tr -d ' ')
printf "\n  total %s KB -> %s KB  (%s%% smaller)\n" \
  "$((before / 1024))" "$((after / 1024))" "$((100 - after * 100 / before))"
