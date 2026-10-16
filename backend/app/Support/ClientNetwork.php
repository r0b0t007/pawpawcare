<?php

namespace App\Support;

use Illuminate\Http\Request;

/**
 * The caller's network, for per-IP rate limits: the IPv4 address, or the
 * /64 of an IPv6 one. A single IPv6 subscriber holds a whole /64, so keying
 * on the full address would hand them 2^64 separate budgets.
 */
final class ClientNetwork
{
    public static function of(Request $request): string
    {
        $ip = (string) $request->ip();
        // IPv4-mapped (::ffff:a.b.c.d, from some dual-stack sockets) is
        // plain IPv4 — its /64 would lump every IPv4 client together.
        if (str_starts_with(strtolower($ip), '::ffff:') && filter_var(substr($ip, 7), FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            return substr($ip, 7);
        }
        if (str_contains($ip, ':') && ($bin = @inet_pton($ip)) !== false) {
            return inet_ntop(substr($bin, 0, 8).str_repeat("\0", 8));
        }

        return $ip;
    }
}
