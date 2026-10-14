<?php

use App\Http\Controllers\AdminController;
use App\Http\Controllers\AppointmentController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\CareController;
use App\Http\Controllers\ClinicController;
use App\Http\Controllers\CommunityController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\DeviceController;
use App\Http\Controllers\DocumentController;
use App\Http\Controllers\EmailVerificationController;
use App\Http\Controllers\ExportController;
use App\Http\Controllers\GamificationController;
use App\Http\Controllers\HealthController;
use App\Http\Controllers\LostPetController;
use App\Http\Controllers\MedicationController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\PetController;
use App\Http\Controllers\PetShareController;
use App\Http\Controllers\PetSharingController;
use App\Http\Controllers\ReminderController;
use App\Http\Controllers\RevenueCatWebhookController;
use App\Http\Controllers\SubscriptionController;
use App\Http\Controllers\SupportController;
use App\Http\Controllers\UploadController;
use App\Http\Controllers\UserController;
use Illuminate\Support\Facades\Route;

// ── Health ──────────────────────────────────────────────────────────────────
// 503 when logins can't be signed, the database is unreachable, or storage
// can't be written, so the post-deploy check in deploy-backend.yml and the
// Sentry uptime monitor fail loudly. (The reason is logged, never returned.)
// Rate-limited inside the controller: the throttle middleware would 500 on the
// very disk or database failure this endpoint exists to report.
Route::get('/health', HealthController::class);

// ── Signed document delivery (no JWT — the signature is the authorization) ────
// The URL is minted only for users with pet access via /pets/{pet}/documents/{id}/url
// and expires within minutes, so a leaked link can't grant lasting access.
Route::get('/documents/{document}/raw', [DocumentController::class, 'raw'])
    ->middleware(['signed', 'throttle:60,1,doc-raw:'])
    ->name('documents.raw');

// ── Vet share page (no JWT — same signed-URL trust model as documents.raw) ────
// A read-only medical summary a vet opens in a browser. Minted only by users
// with pet access via POST /pets/{pet}/share-link, expiring in hours/days.
Route::get('/share/{pet}', [PetShareController::class, 'show'])
    ->middleware(['signed', 'throttle:60,1,pet-share:'])
    ->name('pets.share');

// ── Caretaker page (no JWT — signed-URL trust model, independent care_token) ──
// A read-only sitter handoff: care notes, feeding, active meds, emergency
// contact. Minted via POST /pets/{pet}/care-link, expiring in days.
Route::get('/care/{pet}', [CareController::class, 'page'])
    ->middleware(['signed', 'throttle:60,1,care-page:'])
    ->name('pets.care');

// ── Auth (public, rate-limited to blunt brute-force) ─────────────────────────
// RevenueCat server-to-server webhook: authenticated by its shared secret
// (Authorization header), not a user JWT. The limit is per IP and RevenueCat
// delivers from a small pool, so it's generous; unauthenticated requests are
// rejected before any database work.
Route::post('/webhooks/revenuecat', [RevenueCatWebhookController::class, 'handle'])
    ->middleware('throttle:600,1,rc-webhook:');

Route::middleware('throttle:20,1,auth:')->group(function () {
    Route::post('/auth/signup', [AuthController::class, 'signup']);
    Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:login');
    Route::post('/auth/google', [AuthController::class, 'google']);
    Route::post('/auth/apple', [AuthController::class, 'apple']);
    Route::post('/auth/refresh', [AuthController::class, 'refresh']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);
});

// ── Password reset (public; named limiters — see AppServiceProvider) ─────────
// forgot-password always answers 200 so it can't enumerate accounts;
// reset-password is capped per IP against 6-digit code brute-forcing.
Route::post('/auth/forgot-password', [AuthController::class, 'forgotPassword'])
    ->middleware('throttle:forgot-password');
Route::post('/auth/reset-password', [AuthController::class, 'resetPassword'])
    ->middleware('throttle:password-reset');

// ── Authenticated ───────────────────────────────────────────────────────────
// `throttle:api` (see AppServiceProvider) is a generous per-user ceiling that
// backstops every route; the tighter per-route limiters below stack on top.
Route::middleware(['auth.jwt', 'throttle:api'])->group(function () {
    // Uploads (images)
    Route::post('/uploads', [UploadController::class, 'store'])->middleware('throttle:30,1,upload:');

    // Users
    Route::get('/users/me', [UserController::class, 'me']);
    Route::patch('/users/me', [UserController::class, 'update']);
    // GDPR deletion: disables now, purges after the 30-day grace period.
    Route::delete('/users/me', [UserController::class, 'destroy'])->middleware('throttle:5,60,acct-delete:');
    // After a purchase / restore: re-read the caller's plan from RevenueCat.
    Route::post('/users/me/subscription/sync', [SubscriptionController::class, 'sync'])->middleware('throttle:10,1,sub-sync:');

    // Email ownership (emailed 6-digit code). Required before pet invites —
    // which are addressed by email alone — can be seen or accepted.
    Route::post('/users/me/email-verification', [EmailVerificationController::class, 'send'])
        ->middleware('throttle:5,60,email-verify-send:');
    Route::post('/users/me/email-verification/confirm', [EmailVerificationController::class, 'confirm'])
        ->middleware('throttle:10,60,email-verify-confirm:');

    // Export center — full health-record history as CSV/PDF, free forever.
    // Named limiter (see AppServiceProvider): 10/hour per user.
    Route::get('/users/me/export', [ExportController::class, 'export'])
        ->middleware('throttle:records-export');

    // Pets
    Route::get('/pets', [PetController::class, 'index']);
    Route::post('/pets', [PetController::class, 'store']);
    Route::get('/pets/{pet}', [PetController::class, 'show']);
    Route::patch('/pets/{pet}', [PetController::class, 'update']);
    Route::delete('/pets/{pet}', [PetController::class, 'destroy']);

    // Vet share link (read-only medical summary for a browser)
    Route::post('/pets/{pet}/share-link', [PetShareController::class, 'create'])->middleware('throttle:20,1,share-link:');
    Route::delete('/pets/{pet}/share-link', [PetShareController::class, 'revoke']);

    // Caretaker mode — sitter handoff profile + time-limited caretaker link
    Route::get('/pets/{pet}/care', [CareController::class, 'show']);
    Route::put('/pets/{pet}/care', [CareController::class, 'update']);
    Route::post('/pets/{pet}/care-link', [CareController::class, 'createLink'])->middleware('throttle:20,1,care-link:');
    Route::delete('/pets/{pet}/care-link', [CareController::class, 'revokeLink']);

    // Vaccinations
    Route::get('/pets/{pet}/vaccinations', [PetController::class, 'listVaccinations']);
    Route::post('/pets/{pet}/vaccinations', [PetController::class, 'addVaccination']);
    Route::patch('/pets/{pet}/vaccinations/{vax}/complete', [PetController::class, 'completeVaccination']);
    Route::delete('/pets/{pet}/vaccinations/{vax}', [PetController::class, 'deleteVaccination']);

    // Medications
    Route::get('/pets/{pet}/medications', [MedicationController::class, 'index']);
    Route::post('/pets/{pet}/medications', [MedicationController::class, 'store']);
    Route::patch('/pets/{pet}/medications/{medication}', [MedicationController::class, 'update']);
    Route::delete('/pets/{pet}/medications/{medication}', [MedicationController::class, 'destroy']);
    Route::post('/pets/{pet}/medications/{medication}/log', [MedicationController::class, 'logDose']);

    // Activities
    Route::get('/pets/{pet}/activities', [PetController::class, 'listActivities']);
    Route::post('/pets/{pet}/activities', [PetController::class, 'addActivity']);
    Route::delete('/pets/{pet}/activities/{activity}', [PetController::class, 'deleteActivity']);

    // Favorite foods
    Route::get('/pets/{pet}/foods', [PetController::class, 'listFoods']);
    Route::post('/pets/{pet}/foods', [PetController::class, 'addFood']);
    Route::delete('/pets/{pet}/foods/{food}', [PetController::class, 'deleteFood']);

    // Weight history
    Route::get('/pets/{pet}/weights', [PetController::class, 'listWeights']);
    Route::post('/pets/{pet}/weights', [PetController::class, 'addWeight']);
    Route::delete('/pets/{pet}/weights/{weight}', [PetController::class, 'deleteWeight']);

    // Expenses
    Route::get('/pets/{pet}/expenses', [PetController::class, 'listExpenses']);
    Route::post('/pets/{pet}/expenses', [PetController::class, 'addExpense']);
    Route::delete('/pets/{pet}/expenses/{expense}', [PetController::class, 'deleteExpense']);

    // Pet sharing (co-owners)
    Route::get('/pets/{pet}/members', [PetSharingController::class, 'members']);
    Route::post('/pets/{pet}/invites', [PetSharingController::class, 'invite'])->middleware('throttle:20,1,invite:');
    Route::delete('/pets/{pet}/invites/{invite}', [PetSharingController::class, 'cancelInvite']);
    Route::delete('/pets/{pet}/members/{member}', [PetSharingController::class, 'removeMember']);
    Route::post('/pets/{pet}/leave', [PetSharingController::class, 'leave']);

    // Invitations addressed to the current user
    Route::get('/invites', [PetSharingController::class, 'listInvites']);
    Route::post('/invites/{invite}/accept', [PetSharingController::class, 'accept']);
    Route::post('/invites/{invite}/decline', [PetSharingController::class, 'decline']);

    // Medical records vault — clinics, appointments, documents
    Route::get('/pets/{pet}/clinics', [ClinicController::class, 'index']);
    Route::post('/pets/{pet}/clinics', [ClinicController::class, 'store']);
    Route::patch('/pets/{pet}/clinics/{clinic}', [ClinicController::class, 'update']);
    Route::delete('/pets/{pet}/clinics/{clinic}', [ClinicController::class, 'destroy']);

    Route::get('/pets/{pet}/appointments', [AppointmentController::class, 'index']);
    Route::post('/pets/{pet}/appointments', [AppointmentController::class, 'store']);
    Route::patch('/pets/{pet}/appointments/{appointment}', [AppointmentController::class, 'update']);
    Route::delete('/pets/{pet}/appointments/{appointment}', [AppointmentController::class, 'destroy']);

    Route::get('/pets/{pet}/documents', [DocumentController::class, 'index']);
    Route::post('/pets/{pet}/documents', [DocumentController::class, 'store'])->middleware('throttle:30,1,doc-upload:');
    Route::get('/pets/{pet}/documents/{document}/url', [DocumentController::class, 'url']);
    // AI intake — expensive model call, so throttled tighter than other routes.
    Route::post('/pets/{pet}/documents/{document}/extract', [DocumentController::class, 'extract'])->middleware('throttle:10,1,doc-extract:');
    Route::post('/pets/{pet}/documents/{document}/apply', [DocumentController::class, 'applyExtraction']);
    Route::delete('/pets/{pet}/documents/{document}', [DocumentController::class, 'destroy']);

    // Lost pets (community alerts)
    Route::get('/lost-pets', [LostPetController::class, 'index']);
    Route::get('/lost-pets/mine', [LostPetController::class, 'mine']);
    Route::post('/pets/{pet}/lost-report', [LostPetController::class, 'report'])->middleware('throttle:10,1,lost-report:');
    Route::patch('/lost-pets/{report}/resolve', [LostPetController::class, 'resolve']);

    // Community
    Route::get('/community/posts', [CommunityController::class, 'listPosts']);
    Route::post('/community/posts', [CommunityController::class, 'createPost'])->middleware('throttle:30,1,post:');
    Route::delete('/community/posts/{post}', [CommunityController::class, 'deletePost']);
    Route::post('/community/posts/{post}/paw', [CommunityController::class, 'togglePaw']);
    // Reporting: POST is throttled (named limiter, 10/hour per user); the
    // DELETE undo isn't, so undoing never burns the reporter's quota.
    Route::post('/community/posts/{post}/report', [CommunityController::class, 'reportPost'])
        ->middleware('throttle:post-report');
    Route::delete('/community/posts/{post}/report', [CommunityController::class, 'unreportPost']);
    Route::get('/community/posts/{post}/comments', [CommunityController::class, 'listComments']);
    Route::post('/community/posts/{post}/comments', [CommunityController::class, 'addComment'])->middleware('throttle:30,1,comment:');
    Route::delete('/community/posts/{post}/comments/{comment}', [CommunityController::class, 'deleteComment']);
    Route::get('/community/groups', [CommunityController::class, 'listGroups']);
    Route::post('/community/groups/{group}/join', [CommunityController::class, 'toggleGroup']);

    // Support (help & contact) — stored, then forwarded to SUPPORT_INBOX
    Route::post('/support/messages', [SupportController::class, 'store'])->middleware('throttle:support');

    // Dashboard
    Route::get('/dashboard', [DashboardController::class, 'index']);

    // Gamification (weekly care streaks + milestone badges, nightly-computed)
    Route::get('/gamification/summary', [GamificationController::class, 'summary']);
    Route::get('/gamification/recap', [GamificationController::class, 'recap']);

    // Devices (push token registration)
    Route::post('/devices', [DeviceController::class, 'store']);
    Route::delete('/devices', [DeviceController::class, 'destroy']);

    // Reminders
    Route::get('/reminders', [ReminderController::class, 'index']);
    Route::post('/reminders', [ReminderController::class, 'store']);
    Route::patch('/reminders/{reminder}', [ReminderController::class, 'update']);
    Route::delete('/reminders/{reminder}', [ReminderController::class, 'destroy']);

    // Notification center (reminder deliveries)
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::post('/notifications/{notification}/read', [NotificationController::class, 'read']);
    Route::post('/notifications/{notification}/snooze', [NotificationController::class, 'snooze']);
    Route::post('/notifications/{notification}/dismiss', [NotificationController::class, 'dismiss']);
});

// ── Admin moderation (auth.jwt first, then the is_admin gate) ────────────────
// Admins are only mintable from the server shell (`php artisan user:make-admin`);
// no HTTP request can set is_admin, so this group is unreachable by sign-up.
Route::middleware(['auth.jwt', 'admin', 'throttle:api'])->prefix('admin')->group(function () {
    Route::get('/reports', [AdminController::class, 'reports']);
    Route::post('/posts/{post}/dismiss-reports', [AdminController::class, 'dismissReports']);
    Route::delete('/posts/{post}', [AdminController::class, 'deletePost']);
});
