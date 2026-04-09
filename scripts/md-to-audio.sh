#!/bin/bash
#
# md-to-audio.sh — Convert a Markdown file to an audio file using macOS `say`
#
# Usage:
#   ./scripts/md-to-audio.sh <input.md> [output.aiff] [voice]
#
# Examples:
#   ./scripts/md-to-audio.sh resources/books/mybook.md
#   ./scripts/md-to-audio.sh resources/books/mybook.md output.aiff Samantha
#   ./scripts/md-to-audio.sh resources/books/mybook.md output.m4a "Reed (English (US))"
#
# Supported output formats: .aiff (default), .m4a (AAC — smaller file size)
# Run `say -v '?'` to see all available voices.

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <input.md> [output_file] [voice]"
  echo ""
  echo "  output_file  .aiff (default) or .m4a for compressed AAC"
  echo "  voice        macOS voice name (default: Samantha)"
  echo ""
  echo "Available English voices:"
  say -v '?' | grep en_US | grep -v -E 'Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Wobble|Jester|Superstar|Trinoids|Whisper|Zarvox|Good News|Organ'
  exit 1
fi

INPUT="$1"

if [ ! -f "$INPUT" ]; then
  echo "Error: File not found: $INPUT"
  exit 1
fi

# Default output: same name as input but with .aiff extension
BASENAME=$(basename "$INPUT" .md)
OUTPUT="${2:-${BASENAME}.aiff}"
VOICE="${3:-Samantha}"

# Determine file format from extension
EXT="${OUTPUT##*.}"
case "$EXT" in
  m4a)  FILE_FORMAT="--file-format=m4af --data-format=aac" ;;
  aiff) FILE_FORMAT="" ;;
  *)    echo "Error: Unsupported format .$EXT (use .aiff or .m4a)"; exit 1 ;;
esac

# Strip markdown syntax to produce clean text for TTS
clean_markdown() {
  sed -E \
    -e 's/^#{1,6} //' \
    -e 's/^---+$//' \
    -e 's/\*\*([^*]+)\*\*/\1/g' \
    -e 's/\*([^*]+)\*/\1/g' \
    -e 's/`([^`]+)`/\1/g' \
    -e 's/```[a-z]*//g' \
    -e 's/```//g' \
    -e 's/\[([^]]+)\]\([^)]+\)/\1/g' \
    -e 's/^[>] ?//' \
    -e 's/^[[:space:]]*[-*+] //' \
    -e 's/^[[:space:]]*[0-9]+\. //' \
    -e '/^[[:space:]]*$/d' \
    "$1"
}

echo "Converting: $INPUT"
echo "Voice:      $VOICE"
echo "Output:     $OUTPUT"
echo ""

# Get cleaned text
CLEAN_TEXT=$(clean_markdown "$INPUT")
CHAR_COUNT=${#CLEAN_TEXT}
echo "Characters: $CHAR_COUNT"

# Estimate duration (~150 words per minute for speech)
WORD_COUNT=$(echo "$CLEAN_TEXT" | wc -w | tr -d ' ')
EST_MINUTES=$(( WORD_COUNT / 150 ))
echo "Words:      $WORD_COUNT (~${EST_MINUTES}min estimated)"
echo ""
echo "Generating audio..."

# Generate audio file
echo "$CLEAN_TEXT" | say -v "$VOICE" $FILE_FORMAT -o "$OUTPUT"

# Show result
FILE_SIZE=$(du -h "$OUTPUT" | cut -f1 | tr -d ' ')
echo "Done! Saved to: $OUTPUT ($FILE_SIZE)"
