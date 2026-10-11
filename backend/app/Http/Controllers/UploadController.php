<?php

namespace App\Http\Controllers;

use App\Support\Uploads;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UploadController extends Controller
{
    /**
     * Store an uploaded image and return its URL: relative on the local disk
     * (e.g. /storage/uploads/abc.jpg, which the client resolves against its API
     * base, so the same value works from emulators, devices, and tunnels) or
     * absolute on R2 (MEDIA_URL/uploads/abc.jpg). The file is re-encoded via GD,
     * which strips EXIF/metadata (so photos can't leak the owner's GPS location)
     * and guarantees the bytes are a real image.
     */
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'file' => 'required|file|image|max:5120', // 5 MB; `image` excludes SVG by default
        ]);

        // Recorded against the uploader: only they can attach it to a record.
        return response()->json(['url' => Uploads::storeImage($request->file('file'), $request->user()->id)], 201);
    }
}
