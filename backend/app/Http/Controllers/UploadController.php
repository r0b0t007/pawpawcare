<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

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

        $file = $request->file('file');

        $image = @imagecreatefromstring((string) file_get_contents($file->getRealPath()));
        if ($image === false) {
            abort(422, 'The file could not be read as an image.');
        }
        imagepalettetotruecolor($image);

        ob_start();
        switch ($file->getMimeType()) {
            case 'image/png':
                imagealphablending($image, false);
                imagesavealpha($image, true);
                imagepng($image, null, 6);
                $ext = 'png';
                break;
            case 'image/webp':
                if (function_exists('imagewebp')) {
                    imagewebp($image, null, 85);
                    $ext = 'webp';
                } else {
                    imagejpeg($image, null, 85);
                    $ext = 'jpg';
                }
                break;
            case 'image/gif':
                imagegif($image); // note: re-encode keeps the first frame only
                $ext = 'gif';
                break;
            default:
                imagejpeg($image, null, 85);
                $ext = 'jpg';
        }
        $binary = (string) ob_get_clean();
        imagedestroy($image);

        $path = 'uploads/'.Str::random(40).'.'.$ext;
        Storage::disk('public')->put($path, $binary);

        return response()->json(['url' => '/storage/'.$path], 201);
    }
}
