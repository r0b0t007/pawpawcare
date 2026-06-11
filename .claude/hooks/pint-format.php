<?php

/**
 * PostToolUse hook: auto-format edited PHP files with Laravel Pint.
 *
 * Claude Code runs this in Git Bash on Windows and feeds the tool event as
 * JSON on stdin. We read `tool_input.file_path`, and if it's a PHP source file
 * under backend/ (not vendor/storage/cache), run Pint on just that one file.
 *
 * It always exits 0 — a formatter must never block the edit workflow. PHP is
 * used instead of jq/bash because it's guaranteed present in this Laravel repo.
 */
$raw = stream_get_contents(STDIN);
$data = json_decode($raw ?: '', true);
$file = $data['tool_input']['file_path'] ?? '';

if ($file === '') {
    exit(0);
}

// Normalize Windows back-slashes so the path checks are separator-agnostic.
$norm = strtolower(str_replace('\\', '/', $file));

// Only PHP sources living under backend/, skipping generated/vendored trees.
if (! str_ends_with($norm, '.php')
    || ! str_contains($norm, '/backend/')
    || preg_match('#/backend/(vendor|storage|bootstrap/cache)/#', $norm)) {
    exit(0);
}

// Project root: prefer the env var Claude provides, else walk up from this file.
$projectDir = getenv('CLAUDE_PROJECT_DIR') ?: dirname(__DIR__, 2);
$backend = $projectDir.'/backend';
$pint = $backend.'/vendor/bin/pint';

if (! is_file($pint)) {
    exit(0); // Pint not installed (e.g. deps not yet composer-installed) — no-op.
}

// Run from backend/ so Pint resolves its preset/config there, on this file only.
chdir($backend);
$cmd = escapeshellarg(PHP_BINARY).' '.escapeshellarg($pint).' '.escapeshellarg($file);
exec($cmd.' 2>&1', $out, $code);

exit(0);
