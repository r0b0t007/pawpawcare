<?php

namespace Tests\Feature;

use App\Models\Group;
use App\Models\User;
use App\Services\JwtService;
use Database\Seeders\GroupSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * The seeded community groups are named and described in the reader's
 * language (lang/{locale}/groups.php, by groups.translation_key); any other
 * group shows its stored text. English is the seeded text, unchanged.
 */
class GroupLocaleTest extends TestCase
{
    use RefreshDatabase;

    private function token(string $locale): string
    {
        $user = User::create([
            'name' => 'Reader',
            'email' => 'u'.uniqid().'@example.com',
            'hashed_password' => Hash::make('secret123'),
            'timezone' => 'UTC',
        ]);
        $user->forceFill(['locale' => $locale])->save();

        return JwtService::createAccessToken($user->id);
    }

    /** name => description, as GET /community/groups returns them. */
    private function groupsFor(string $locale): array
    {
        return collect($this->withToken($this->token($locale))->getJson('/community/groups')->assertOk()->json())
            ->mapWithKeys(fn ($g) => [$g['name'] => $g['description']])
            ->all();
    }

    private function seededEnglish(): array
    {
        return collect(GroupSeeder::DEFAULT_GROUPS)->mapWithKeys(fn ($g) => [$g['name'] => $g['description']])->all();
    }

    private function runBackfill(): void
    {
        (require database_path('migrations/2026_10_16_100002_backfill_group_translation_keys.php'))->up();
    }

    private function insertRawGroup(string $name, ?string $description = null): string
    {
        $id = (string) Str::uuid();
        DB::table('groups')->insert([
            'id' => $id, 'name' => $name, 'description' => $description,
            'location' => 'Global', 'icon' => 'paw', 'created_at' => now(),
        ]);

        return $id;
    }

    public function test_english_is_the_seeded_text_byte_for_byte(): void
    {
        $this->seed(GroupSeeder::class);

        $this->assertSame($this->seededEnglish(), $this->groupsFor('en'));
        // The lang file mirrors the seeder exactly.
        foreach (GroupSeeder::DEFAULT_GROUPS as $group) {
            $this->assertSame($group['name'], trans('groups.'.$group['translation_key'].'.name', [], 'en'));
            $this->assertSame($group['description'], trans('groups.'.$group['translation_key'].'.description', [], 'en'));
        }
    }

    public function test_seeded_groups_are_translated_for_french_and_spanish_readers(): void
    {
        $this->seed(GroupSeeder::class);

        $fr = $this->groupsFor('fr');
        $this->assertArrayHasKey('Amoureux des chiens', $fr);
        $this->assertSame('Partagez les aventures de votre félin et obtenez des conseils d\'experts.', $fr['Parents de chats']);
        $this->assertArrayHasKey('Éducation des chiots', $fr);
        $this->assertCount(5, $fr);
        $this->assertSame([], array_intersect(array_keys($fr), array_keys($this->seededEnglish())));

        $es = $this->groupsFor('es');
        $this->assertArrayHasKey('Amantes de los perros', $es);
        $this->assertArrayHasKey('Mascotas exóticas', $es);
        $this->assertCount(5, $es);
    }

    public function test_the_response_shape_is_unchanged(): void
    {
        $this->seed(GroupSeeder::class);

        $group = $this->withToken($this->token('fr'))->getJson('/community/groups')->assertOk()->json(0);

        $this->assertSame(
            ['id', 'name', 'description', 'location', 'icon', 'member_count', 'is_member', 'created_at'],
            array_keys($group),
        );
    }

    public function test_joining_returns_the_translated_group(): void
    {
        $this->seed(GroupSeeder::class);
        $id = Group::where('translation_key', 'dog_lovers')->value('id');

        $this->withToken($this->token('es'))
            ->postJson("/community/groups/{$id}/join")
            ->assertOk()
            ->assertJsonPath('name', 'Amantes de los perros')
            ->assertJsonPath('is_member', true);
    }

    public function test_a_group_without_a_key_shows_its_stored_text_in_every_language(): void
    {
        $this->insertRawGroup('Club Teckel Lyon', 'Rencontres le samedi.');

        $this->assertSame(['Club Teckel Lyon' => 'Rencontres le samedi.'], $this->groupsFor('es'));
        $this->assertSame(['Club Teckel Lyon' => 'Rencontres le samedi.'], $this->groupsFor('en'));
    }

    public function test_backfill_keys_the_five_seeded_names_and_leaves_other_rows_alone(): void
    {
        // Rows as production has them: seeded before translation_key existed.
        $ids = [];
        foreach (GroupSeeder::DEFAULT_GROUPS as $group) {
            $ids[$group['name']] = $this->insertRawGroup($group['name'], $group['description']);
        }
        $lookalike = $this->insertRawGroup('dog lovers');
        $padded = $this->insertRawGroup('Dog Lovers ');
        $other = $this->insertRawGroup('Bird Watchers');

        $this->runBackfill();
        $this->runBackfill(); // idempotent

        foreach (GroupSeeder::DEFAULT_GROUPS as $group) {
            $this->assertSame($group['translation_key'], DB::table('groups')->where('id', $ids[$group['name']])->value('translation_key'));
        }
        foreach ([$lookalike, $padded, $other] as $id) {
            $this->assertNull(DB::table('groups')->where('id', $id)->value('translation_key'));
        }
        // Stored text is never rewritten.
        $this->assertSame('Dog Lovers', DB::table('groups')->where('id', $ids['Dog Lovers'])->value('name'));

        $fr = $this->groupsFor('fr');
        $this->assertArrayHasKey('Amoureux des chiens', $fr);
        $this->assertArrayHasKey('dog lovers', $fr);
        $this->assertArrayHasKey('Bird Watchers', $fr);
    }

    public function test_backfill_keeps_an_existing_key(): void
    {
        $id = $this->insertRawGroup('Dog Lovers');
        DB::table('groups')->where('id', $id)->update(['translation_key' => 'cat_parents']);

        $this->runBackfill();

        $this->assertSame('cat_parents', DB::table('groups')->where('id', $id)->value('translation_key'));
    }
}
