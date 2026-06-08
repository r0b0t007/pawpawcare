<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UploadController extends Controller
{
    /**
     * Store an uploaded image on the public disk and return a relative URL
     * (e.g. /storage/uploads/abc.jpg). The client resolves it against its API
     * base, so the same path works from emulators, devices, and tunnels.
     */
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'file' => 'required|file|image|max:5120', // 5 MB
        ]);

        $path = $request->file('file')->store('uploads', 'public');

        return response()->json(['url' => '/storage/'.$path], 201);
    }
}
