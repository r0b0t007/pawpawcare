<?php

namespace App\Http\Controllers;

use App\Support\Uploads;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UploadController extends Controller
{
    /**
     * Store an uploaded image and return a relative URL (e.g. /storage/uploads/abc.jpg).
     * The file is re-encoded via GD, which strips EXIF/metadata (so photos can't leak
     * the owner's GPS location) and guarantees the bytes are a real image. The client
     * resolves the relative path against its API base, so the same value works from
     * emulators, devices, and tunnels.
     */
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'file' => 'required|file|image|max:5120', // 5 MB; `image` excludes SVG by default
        ]);

        return response()->json(['url' => Uploads::storeImage($request->file('file'), 'uploads')], 201);
    }
}
