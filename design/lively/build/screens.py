"""PawPawCare "Lively & Light" mockups — generates a DesignCraft script.

Each page is a review board: an iPhone-sized screen (390x844 pt) on the
left, the design rationale on the right with numbered pins on the screen.
Run via build.ps1 / build.sh, not directly.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dc import Doc  # noqa: E402

BW, BH = 880, 940          # board size
SX, SY = 56, 48            # phone screen origin on the board
W, H = 390, 844            # phone screen size

SWATCHES = {
    'ink': '#241a0e', 'sub': '#6f604c', 'subtle': '#8a6f4d', 'accent': '#8a5300',
    'accentTint': '#ffddb8', 'bg': '#fffaf6', 'white': '#ffffff', 'border': '#eee2d3',
    'hairline': '#f4ecdf', 'track': '#f3ead9', 'faint': '#cbb897', 'controlBorder': '#e3d5c2',
    'danger': '#ba1a1a', 'dangerTint': '#ffdad6', 'dangerText': '#93000a',
    'warn': '#d4a000', 'warnTint': '#fff3d0', 'warnText': '#7a5c00',
    'success': '#1a6b3a', 'successTint': '#e6f4ea', 'ringOk': '#7cbf8e',
    'peach-bg': '#ffddb8', 'peach-fg': '#8a5300', 'sky-bg': '#c5e7ff', 'sky-fg': '#004c6a',
    'leaf-bg': '#d0f0c0', 'leaf-fg': '#1a6b3a', 'rose-bg': '#ffd6e7', 'rose-fg': '#96375c',
    'lav-bg': '#e9e2f4', 'lav-fg': '#5c4a82',
    'shadow': '#5a3a10', 'bezel': '#1f1812', 'board': '#efe3d2', 'island': '#000000',
}

PETS = {
    'biscuit': dict(name='Biscuit', breed='Golden Retriever', age='4 y', c='peach', sp='dog'),
    'miso': dict(name='Miso', breed='Orange Tabby', age='2 y', c='rose', sp='cat'),
    'luna': dict(name='Luna', breed='Shorthair', age='7 y', c='lav', sp='cat'),
    'pepper': dict(name='Pepper', breed='Beagle', age='6 mo', c='leaf', sp='dog'),
}


def P(name):
    return f'photos/crops/{name}.jpg'


def tw(s, size, weight=600):
    """Rough text width for Plus Jakarta Sans."""
    k = {400: .54, 600: .57, 700: .6, 800: .63}[weight]
    return len(s) * size * k


d = Doc()

# ---------------------------------------------------------------- widgets


def button(x, y, w, h, label, kind='primary', icon=None, size=15, r=16):
    fill, fg, stroke = {
        'primary': ('accent', 'white', None),
        'ghost': ('white', 'ink', 'controlBorder'),
        'tint': ('accentTint', 'accent', None),
    }[kind]
    d.box(x, y, w, h, fill=fill, r=r, stroke=stroke, sw=1.5,
          shadow={'opacity': 18, 'size': 12, 'distance': 3} if kind == 'primary' and h >= 48 else None)
    total = tw(label, size, 700) + (size + 8 if icon else 0)
    sx = x + (w - total) / 2
    if icon:
        d.icon(icon, sx, y + (h - size - 2) / 2, size=size + 2, color=fg)
        sx += size + 8
    d.text(sx - 4, y, tw(label, size, 700) + 12, label, size=size, weight=700, color=fg,
           h=h, valign='center', lead=size + 4)


def pill(x, y, label, bg, fg, icon=None, size=12, h=26, weight=700):
    w = tw(label, size, weight) + 20 + (size + 4 if icon else 0)
    d.box(x, y, w, h, fill=bg, r=h / 2)
    tx = x + 10
    if icon:
        d.icon(icon, tx, y + (h - size - 2) / 2 - 0.5, size=size + 1, color=fg)
        tx += size + 4
    d.text(tx, y, w, label, size=size, weight=weight, color=fg, h=h, valign='center', lead=size + 3)
    return w


def label(x, y, s, color='subtle', w=200, align='left'):
    d.text(x, y, w, s, size=11, weight=700, color=color, caps=True, track=120, align=align)


def avatar(pet, cx, cy, dia, ring=True, ring_w=4):
    c = PETS[pet]['c']
    if ring:
        d.circle(cx, cy, dia + ring_w * 2, fill=f'{c}-bg')
    d.photo(P(f'{pet}-face'), cx - dia / 2, cy - dia / 2, dia, dia, shape='ellipse',
            stroke='white', sw=2)


def icon_chip(name, x, y, dia, bg, fg, size=None):
    d.circle(x + dia / 2, y + dia / 2, dia, fill=bg)
    s = size or round(dia * .5)
    d.icon(name, x + (dia - s) / 2, y + (dia - s) / 2 - 1, size=s, color=fg)


def card(x, y, w, h, r=22, shadow=False, fill='white'):
    d.box(x, y, w, h, fill=fill, r=r, stroke='border',
          shadow={'opacity': 9, 'size': 18, 'distance': 6} if shadow else None)


def hairline(x, y, w):
    d.box(x, y, w, 1, fill='hairline')


def task_row(pet, y, title, sub, right=None, x=16, w=358, pill_spec=None, button_label=None):
    avatar(pet, x + 32, y + 27, 36, ring_w=3)
    d.text(x + 62, y + 9, 200, title, size=15, weight=600)
    d.text(x + 62, y + 30, 210, sub, size=12, color='sub')
    if pill_spec:
        lab, bg, fg, ic = pill_spec
        pw = tw(lab, 12, 700) + 20 + 16
        pill(x + w - 16 - pw, y + 14, lab, bg, fg, icon=ic)
    elif button_label:
        button(x + w - 74, y + 11, 60, 32, button_label, 'tint', size=13, r=12)
    elif right:
        d.text(x + w - 116, y + 18, 100, right, size=12, weight=600, color='sub', align='right')


def tab_bar(active):
    d.box(0, 760, W, 84, fill='white')
    d.box(0, 760, W, 1, fill='border')
    tabs = [('home-variant', 'Home'), ('paw', 'Pets'), ('heart-pulse', 'Health'),
            ('account-group', 'Community'), ('account-circle', 'Profile')]
    cw = W / 5
    for i, (ic, lab) in enumerate(tabs):
        col = 'accent' if i == active else 'sub'
        d.icon(ic, i * cw + (cw - 24) / 2, 772, size=24, color=col)
        d.text(i * cw, 800, cw, lab, size=11, weight=700 if i == active else 600, color=col,
               align='center')


def status_bar(light=False):
    col = 'white' if light else 'ink'
    d.text(34, 15, 60, '9:41', size=16, weight=700, color=col)
    d.icon('signal-cellular-3', 294, 16, size=17, color=col)
    d.icon('wifi', 316, 16, size=17, color=col)
    d.icon('battery', 340, 15, size=20, color=col)


def top_progress(step, total=3):
    d.circle(36, 76, 40, fill='white', stroke='border')
    d.icon('arrow-left', 25, 65, size=22, color='ink')
    d.text(0, 66, W, f'Step {step} of {total}', size=13, weight=700, color='sub', align='center')
    seg = (342 - (total - 1) * 6) / total
    for i in range(total):
        d.box(24 + i * (seg + 6), 112, seg, 6, fill='accent' if i < step else 'track', r=3)


# ---------------------------------------------------------------- boards

def board(num, group, title, question, callouts, draw, light_status=False):
    d.spread = num - 1
    d.ox = d.oy = 0
    d.box(0, 0, BW, BH, fill='board')
    # rationale panel
    label(500, 60, f'{num:02d} · {group}', color='accent', w=340)
    d.text(500, 80, 350, title, size=28, weight=800, lead=34, track=-10)
    d.box(500, 128, 348, 70, fill='white', r=16, stroke='border')
    label(516, 142, 'The one question it answers', w=320)
    d.text(516, 160, 320, question, size=15, weight=700, lead=20)
    y = 222
    for i, (_, _, head, body) in enumerate(callouts, 1):
        d.circle(512, y + 12, 24, fill='accent')
        d.text(500, y + 3, 24, str(i), size=12, weight=800, color='white', align='center')
        d.text(534, y + 1, 314, head, size=15, weight=700)
        lines = max(1, -(-len(body) // 44))
        d.text(534, y + 23, 314, body, size=13, color='sub', lead=19, h=lines * 19 + 6)
        y += 23 + lines * 19 + 22
    d.text(500, 892, 348, 'PawPawCare · Lively & Light · mockups v1 · Oct 2026', size=11,
           color='subtle')
    # phone
    d.ox, d.oy = SX, SY
    d.box(-12, -12, W + 24, H + 24, fill='bezel', r=56,
          shadow={'opacity': 22, 'size': 40, 'distance': 14})
    d.box(0, 0, W, H, fill='bg')
    draw()
    status_bar(light_status)
    d.box(128, 830, 134, 5, fill='ink', r=2.5)
    outer = d.frame(-12, -12, W + 24, H + 24)
    d.cmd('object.fill', {'swatch': 'bezel', 'ids': [d.ref(outer)]})
    d.cmd('object.stroke', {'swatch': '[None]', 'ids': [d.ref(outer)]})
    inner = d.frame(0, 0, W, H)
    pf = d.cmd('object.pathfinder', {'op': 'subtract', 'ids': [d.ref(outer), d.ref(inner)]})
    d.cmd('object.cornerOptions', {'shape': 'rounded', 'size': 46, 'ids': [d.ref(pf)]})
    d.box(135, 11, 120, 34, fill='island', r=17)
    # pins live in the gutter between phone and panel; a leader line points
    # at the element so nothing on the screen is covered.
    gx = 424
    last = -99
    for i, (px, py, _, _) in sorted(enumerate(callouts, 1), key=lambda t: t[1][1]):
        if px is None:
            continue
        y = max(py, last + 32)
        last = y
        ln = d.cmd('line.create', {'spread': d.spread, 'a': [px + SX, py + SY],
                                   'b': [gx - 13 + SX, y + SY]})
        d.cmd('object.stroke', {'swatch': 'accent', 'weight': 1.25, 'ids': [d.ref(ln)]})
        d.circle(px, py, 10, fill='accent', stroke='white', sw=2)
        d.circle(gx, y, 26, fill='accent', stroke='board', sw=2)
        d.text(gx - 13, y - 13, 26, str(i), size=12, weight=800, color='white', align='center',
               h=26, valign='center', lead=14)


# ---------------------------------------------------------------- screens

def welcome():
    d.photo(P('welcome-hero'), 0, 0, W, 540)
    d.box(0, 486, W, 358, fill='bg', r=28)
    d.box(0, 700, W, 144, fill='bg')
    d.photo('../frontend/assets/logo-mark.png', 24, 514, 44, 44, r=12, stroke='border')
    d.text(78, 516, 260, 'PawPawCare', size=15, weight=800, color='accent')
    d.text(78, 537, 260, 'Pet health, made gentle', size=12, color='sub')
    d.text(24, 584, 342, 'Every wag and whisker,\ncared for.', size=30, weight=800, lead=36,
           track=-10)
    d.text(24, 664, 330, 'Vaccines, meds and daily routines for all your pets, in one calm place.',
           size=15, color='sub', lead=22, h=48)
    button(24, 728, 342, 54, 'Get started', icon='arrow-right')
    d.text(24, 796, 342, 'I already have an account', size=14, weight=700, color='accent',
           align='center')


def add_pet_species():
    top_progress(1)
    d.text(24, 138, 342, 'Who are we caring for?', size=26, weight=800, lead=31, track=-10)
    d.text(24, 174, 342, 'Pick one. You can add more pets later.', size=14, color='sub')
    for i, (sp, lab, sel) in enumerate([('dog', 'Dog', True), ('cat', 'Cat', False)]):
        y = 210 + i * 222
        d.photo(P(f'species-{sp}'), 24, y, 342, 206, r=22,
                stroke='accent' if sel else 'border', sw=3 if sel else 1)
        pw = tw(lab, 17, 700) + 30
        d.box(38, y + 152, pw + 26, 40, fill='white', r=20)
        d.icon(sp, 48, y + 161, size=20, color='accent')
        d.text(74, y + 152, pw, lab, size=17, weight=700, h=40, valign='center', lead=20)
        if sel:
            d.circle(338, y + 30, 34, fill='accent', stroke='white', sw=2.5)
            d.icon('check', 327, y + 19, size=22, color='white')
    card(24, 656, 342, 54, r=16)
    icon_chip('rabbit', 36, 663, 40, 'lav-bg', 'lav-fg')
    d.text(88, 656, 230, 'Rabbit, bird or other', size=15, weight=600, h=54, valign='center')
    d.icon('chevron-right', 334, 672, size=22, color='faint')
    button(24, 740, 342, 54, 'Continue')


def add_pet_name():
    top_progress(2)
    d.text(24, 138, 342, "What's their name?", size=26, weight=800, lead=31, track=-10)
    d.text(24, 174, 342, 'A photo helps you spot them at a glance.', size=14, color='sub')
    d.circle(195, 282, 156, fill='peach-bg')
    d.photo(P('biscuit-face'), 127, 214, 136, 136, shape='ellipse', stroke='white', sw=3)
    d.circle(252, 334, 42, fill='accent', stroke='white', sw=3)
    d.icon('camera', 242, 324, size=20, color='white')
    d.text(0, 368, W, 'Change photo', size=13, weight=700, color='accent', align='center')
    label(24, 404, 'Name')
    d.box(24, 422, 342, 54, fill='white', r=14, stroke='accent', sw=2)
    d.text(40, 422, 200, 'Biscuit', size=17, weight=600, h=54, valign='center')
    d.box(40 + tw('Biscuit', 17, 600) + 2, 437, 2, 24, fill='accent')
    label(24, 496, 'Breed · optional')
    x = 24
    for lab, sel in [('Golden Retriever', True), ('Labrador', False), ('Mixed', False)]:
        if sel:
            x += pill(x, 516, lab, 'accentTint', 'accent', icon='check', size=13, h=36) + 8
        else:
            w = tw(lab, 13, 600) + 28
            d.box(x, 516, w, 36, fill='white', r=18, stroke='controlBorder', sw=1.5)
            d.text(x, 516, w, lab, size=13, weight=600, color='ink', align='center', h=36,
                   valign='center', lead=16)
            x += w + 8
    d.box(24, 576, 342, 66, fill='track', r=16)
    d.icon('information-outline', 38, 597, size=22, color='subtle')
    d.text(70, 576, 284, 'Birthday, weight and vet details can wait. Nothing here is permanent.',
           size=13, color='sub', lead=19, h=66, valign='center')
    button(24, 740, 342, 54, 'Continue')


def add_pet_done():
    d.photo(P('success-hug'), 0, 0, W, 440)
    d.box(0, 396, W, 448, fill='bg', r=28)
    d.box(0, 700, W, 144, fill='bg')
    d.circle(195, 398, 68, fill='success', stroke='bg', sw=5)
    d.icon('check', 177, 380, size=36, color='white')
    d.text(0, 446, W, 'Biscuit is all set!', size=28, weight=800, align='center', track=-10)
    d.text(30, 484, 330, "We'll nudge you before anything is due.", size=15, color='sub',
           align='center')
    label(24, 528, 'Two quick wins next')
    card(16, 548, 358, 140, r=20)
    for i, (ic, c, t, s) in enumerate([
            ('needle', 'peach', 'Add vaccine records', '~2 min · keeps reminders accurate'),
            ('bowl-mix', 'leaf', 'Set a feeding routine', '~1 min · daily nudges, never spam')]):
        y = 548 + i * 70
        icon_chip(ic, 30, y + 15, 40, f'{c}-bg', f'{c}-fg')
        d.text(84, y + 15, 240, t, size=15, weight=600)
        d.text(84, y + 37, 250, s, size=12, color='sub')
        d.icon('chevron-right', 340, y + 24, size=22, color='faint')
        if i == 0:
            hairline(84, y + 70, 274)
    button(24, 712, 342, 54, "Go to Biscuit's profile")
    d.text(24, 782, 342, 'Add another pet', size=14, weight=700, color='accent', align='center')


def home_header(greet, title, title_lines=2):
    d.text(24, 60, 280, greet, size=14, weight=600, color='sub')
    d.text(24, 82, 290, title, size=26, weight=800, lead=31, track=-10,
           h=31 * title_lines + 4)
    d.circle(346, 76, 40, fill='white', stroke='border')
    d.icon('bell-outline', 335, 65, size=22, color='ink')
    d.circle(356, 66, 10, fill='accent', stroke='white', sw=2)


def home_ok():
    home_header('Good morning, Ahmed', 'Biscuit and Miso\nare all good')
    pill(24, 152, '12-day care streak', 'warnTint', 'warnText', icon='fire')
    card(16, 196, 358, 208, r=24, shadow=True)
    label(32, 214, 'Today')
    d.text(250, 212, 108, '3 of 4 done', size=12, weight=700, color='sub', align='right')
    seg = (326 - 3 * 6) / 4
    for i in range(4):
        d.box(32 + i * (seg + 6), 236, seg, 8, fill='ringOk' if i < 3 else 'track', r=4)
    avatar('miso', 60, 290, 52)
    d.text(100, 264, 250, 'Up next · 6:00 pm', size=12, weight=600, color='sub')
    d.text(100, 282, 250, "Miso's evening pill", size=17, weight=700)
    d.text(100, 305, 250, 'Apoquel · 1 tablet with food', size=13, color='sub')
    button(32, 342, 186, 46, 'Mark done', icon='check', size=14, r=14)
    button(228, 342, 130, 46, 'Snooze', 'ghost', icon='clock-outline', size=14, r=14)
    label(24, 426, 'Your pets')
    d.text(250, 424, 116, 'See all', size=13, weight=700, color='accent', align='right')
    for i, pet in enumerate(['biscuit', 'miso']):
        x = 16 + i * 187
        p = PETS[pet]
        d.box(x, 448, 171, 150, fill=f"{p['c']}-bg", r=22)
        d.photo(P(f'{pet}-card'), x + 8, 456, 155, 92, r=16)
        d.text(x + 14, 556, 150, p['name'], size=16, weight=700)
        d.text(x + 14, 576, 150, f"{p['breed']} · {p['age']}", size=12, weight=600,
               color=f"{p['c']}-fg")
    label(24, 620, 'Coming up')
    card(16, 640, 358, 110, r=20)
    task_row('biscuit', 642, 'Rabies booster', 'Biscuit · Thu 16 Oct', right='in 4 days')
    hairline(78, 696, 280)
    task_row('miso', 697, 'Nail trim', 'Miso · Sat 18 Oct', right='in 6 days')
    tab_bar(0)


def home_attention():
    home_header('Good evening, Ahmed', 'One thing needs\nyou today')
    d.text(24, 152, 330, '3 of your 4 pets are all good.', size=14, color='sub')
    card(16, 188, 358, 216, r=24, shadow=True)
    pill(32, 204, 'Overdue · 2 days', 'dangerTint', 'dangerText', icon='alert-circle')
    avatar('biscuit', 60, 270, 52)
    d.text(100, 246, 250, 'Rabies booster', size=19, weight=700)
    d.text(100, 272, 252, "Let's get Biscuit's booster booked. Most vets have slots this week.",
           size=13, color='sub', lead=19, h=44)
    button(32, 342, 186, 46, 'Book vet', icon='calendar', size=14, r=14)
    button(228, 342, 130, 46, 'Already done', 'ghost', size=14, r=14)
    label(24, 426, 'Your pets')
    for i, pet in enumerate(['biscuit', 'pepper', 'miso', 'luna']):
        cx = 58 + i * 92
        avatar(pet, cx, 484, 60)
        d.text(cx - 46, 522, 92, PETS[pet]['name'], size=13, weight=600, align='center')
    label(24, 560, 'Coming up')
    card(16, 580, 358, 166, r=20)
    task_row('pepper', 582, 'Deworming tablet', 'Pepper · Wed 15 Oct',
             pill_spec=('Due soon', 'warnTint', 'warnText', 'clock-outline'))
    hairline(78, 636, 280)
    task_row('miso', 637, 'Nail trim', 'Miso · Sat 18 Oct', right='in 6 days')
    hairline(78, 691, 280)
    task_row('luna', 692, 'Annual check-up', 'Luna · Mon 20 Oct', right='in 8 days')
    tab_bar(0)


def home_empty():
    home_header('Welcome to PawPawCare, Ahmed', "Let's meet your pets", title_lines=1)
    d.circle(195, 262, 236, fill='accentTint')
    d.photo(P('empty-kitten'), 95, 162, 200, 200, shape='ellipse', stroke='white', sw=5)
    icon_chip('paw', 290, 158, 48, 'rose-bg', 'rose-fg')
    icon_chip('heart', 62, 330, 40, 'sky-bg', 'sky-fg')
    icon_chip('dog', 300, 330, 36, 'leaf-bg', 'leaf-fg')
    d.text(0, 400, W, 'Add your first pet', size=22, weight=800, align='center', track=-10)
    d.text(40, 432, 310, 'A cat, a dog or any companion. It takes less than a minute.',
           size=15, color='sub', align='center', lead=21, h=46)
    button(24, 494, 342, 54, 'Add your first pet', icon='plus')
    label(24, 576, "What you'll get")
    for i, (ic, c, t) in enumerate([('bell-ring', 'peach', 'Reminders before anything is due'),
                                    ('shield-check', 'sky', 'Every record in one safe place'),
                                    ('account-group', 'leaf', 'Share care with your family')]):
        y = 598 + i * 50
        icon_chip(ic, 24, y, 38, f'{c}-bg', f'{c}-fg')
        d.text(74, y, 290, t, size=15, weight=600, h=38, valign='center')
    tab_bar(0)


def pets_list():
    d.text(24, 64, 300, 'Your pets', size=26, weight=800, track=-10)
    d.text(24, 100, 330, "4 pets · tap one to see today's care", size=13, color='sub')
    status = {
        'biscuit': ('alert-circle', 'danger', 'dangerText', 'Booster overdue'),
        'pepper': ('clock-outline', 'warnText', 'warnText', 'Deworming soon'),
        'miso': ('check-circle', 'success', 'success', 'All good'),
        'luna': ('check-circle', 'success', 'success', 'All good'),
    }
    for i, pet in enumerate(['biscuit', 'pepper', 'miso', 'luna']):
        x, y = 16 + (i % 2) * 191, 132 + (i // 2) * 240
        p = PETS[pet]
        d.box(x, y, 167, 228, fill=f"{p['c']}-bg", r=22)
        d.photo(P(f'{pet}-card'), x + 8, y + 8, 151, 128, r=16)
        d.circle(x + 141, y + 26, 30, fill='white')
        d.icon(p['sp'], x + 132, y + 17, size=18, color=f"{p['c']}-fg")
        d.text(x + 14, y + 146, 145, p['name'], size=17, weight=700)
        d.text(x + 14, y + 168, 145, f"{p['breed']} · {p['age']}", size=12, weight=600,
               color=f"{p['c']}-fg")
        ic, icol, tcol, txt = status[pet]
        d.box(x + 8, y + 190, 151, 30, fill='white', r=12)
        d.icon(ic, x + 16, y + 196, size=17, color=icol)
        d.text(x + 38, y + 190, 120, txt, size=12, weight=700, color=tcol, h=30, valign='center')
    d.box(16, 622, 358, 60, fill='bg', r=18, stroke='faint', sw=1.5)
    d.icon('plus', 118, 640, size=22, color='accent')
    d.text(146, 622, 160, 'Add another pet', size=15, weight=700, color='accent', h=60,
           valign='center')
    tab_bar(1)


def pet_profile():
    d.photo(P('biscuit-hero'), 0, 0, W, 420)
    d.box(0, 0, W, 110, gradient={'kind': 'linear', 'angle': 90, 'stops': [
        {'location': 0, 'color': '#241a0e', 'opacity': 0},
        {'location': 100, 'color': '#241a0e', 'opacity': 40}]})
    d.box(0, 230, W, 190, gradient={'kind': 'linear', 'angle': 90, 'stops': [
        {'location': 0, 'color': '#241a0e', 'opacity': 78},
        {'location': 100, 'color': '#241a0e', 'opacity': 0}]})
    for cx, ic in [(36, 'arrow-left'), (354, 'dots-horizontal')]:
        d.circle(cx, 76, 40, fill='white', opacity=.92)
        d.icon(ic, cx - 11, 65, size=22, color='ink')
    pill(24, 268, 'Dog · Golden Retriever', 'peach-bg', 'peach-fg', icon='dog')
    d.text(24, 302, 340, 'Biscuit', size=36, weight=800, color='white', track=-10, lead=42)
    d.text(24, 346, 340, '4 years · 31.2 kg · microchipped', size=14, weight=600, color='white')
    d.box(0, 384, W, 460, fill='bg', r=28)
    card(16, 402, 358, 174, r=22, shadow=True)
    label(32, 420, 'Today for Biscuit')
    d.text(250, 418, 108, '1 of 3 done', size=12, weight=700, color='sub', align='right')
    rows = [('Breakfast', '7:30 am', True), ('Heartworm chew', '6:00 pm', False),
            ('Dinner', '6:30 pm', False)]
    for i, (t, tm, done) in enumerate(rows):
        y = 444 + i * 42
        d.icon('check-circle' if done else 'checkbox-blank-circle-outline', 30, y + 6, size=24,
               color='success' if done else 'faint')
        d.text(64, y, 170, t, size=15, weight=600, color='sub' if done else 'ink', h=36,
               valign='center')
        if done:
            d.text(230, y, 128, tm, size=12, weight=600, color='sub', align='right', h=36,
                   valign='center')
        else:
            d.text(170, y, 110, tm, size=12, weight=600, color='sub', align='right', h=36,
                   valign='center')
            button(292, y + 3, 66, 30, 'Done', 'tint', size=13, r=10)
    tiles = [('needle', 'peach', 'Health', 'Booster overdue', 'dangerText'),
             ('bowl-mix', 'leaf', 'Routine', '3 daily tasks', 'sub'),
             ('scale-bathroom', 'sky', 'Weight', '31.2 kg · steady', 'sub'),
             ('note-text-outline', 'lav', 'Notes', '2 from family', 'sub')]
    for i, (ic, c, t, v, vc) in enumerate(tiles):
        x, y = 16 + (i % 2) * 183, 592 + (i // 2) * 82
        card(x, y, 175, 72, r=18)
        icon_chip(ic, x + 12, y + 16, 40, f'{c}-bg', f'{c}-fg')
        d.text(x + 62, y + 15, 110, t, size=14, weight=700)
        d.text(x + 62, y + 36, 110, v, size=12, weight=600 if vc != 'sub' else 400, color=vc)
    tab_bar(1)


def health_hub(show_tabs=True):
    d.text(24, 64, 300, 'Health', size=26, weight=800, track=-10)
    d.circle(346, 80, 40, fill='white', stroke='border')
    d.icon('magnify', 335, 69, size=22, color='ink')
    d.box(16, 112, 52, 40, fill='accent', r=20)
    d.text(16, 112, 52, 'All', size=14, weight=700, color='white', align='center', h=40,
           valign='center')
    x = 76
    for pet in ['biscuit', 'miso', 'luna']:
        w = tw(PETS[pet]['name'], 14, 600) + 50
        d.box(x, 112, w, 40, fill='white', r=20, stroke='controlBorder', sw=1.5)
        d.photo(P(f'{pet}-face'), x + 6, 118, 28, 28, shape='ellipse')
        d.text(x + 40, 112, w - 40, PETS[pet]['name'], size=14, weight=600, h=40, valign='center')
        x += w + 8
    label(24, 174, 'Today')
    card(16, 194, 358, 56, r=18)
    task_row('miso', 195, 'Apoquel 16 mg', 'Miso · 6:00 pm', button_label='Log')
    label(24, 270, 'This week')
    card(16, 290, 358, 112, r=18)
    task_row('biscuit', 292, 'Rabies booster', 'Biscuit · was due Fri 10 Oct',
             pill_spec=('Overdue', 'dangerTint', 'dangerText', 'alert-circle'))
    hairline(78, 346, 280)
    task_row('pepper', 347, 'Deworming', 'Pepper · Wed 15 Oct',
             pill_spec=('Due soon', 'warnTint', 'warnText', 'clock-outline'))
    label(24, 422, 'Later')
    card(16, 442, 358, 112, r=18)
    task_row('luna', 444, 'Annual check-up', 'Luna · Mon 20 Oct', right='in 8 days')
    hairline(78, 498, 280)
    task_row('miso', 499, 'FVRCP vaccine', 'Miso · Wed 3 Dec', right='in 7 weeks')
    d.box(16, 572, 358, 76, fill='sky-bg', r=20)
    icon_chip('shield-check', 30, 588, 44, 'white', 'sky-fg')
    d.text(88, 588, 230, 'Medical vault', size=15, weight=700)
    d.text(88, 610, 240, '12 documents · vet records & lab results', size=12, weight=600,
           color='sky-fg')
    d.icon('chevron-right', 340, 598, size=22, color='sky-fg')
    button(206, 686, 168, 52, 'Add record', icon='plus', r=26)
    if show_tabs:
        tab_bar(2)


def log_dose():
    health_hub()
    d.box(0, 0, W, H, fill='ink', opacity=.45)
    d.box(0, 404, W, 440, fill='white', r=28)
    d.box(0, 700, W, 144, fill='white')
    d.box(175, 414, 40, 5, fill='faint', r=2.5)
    avatar('miso', 48, 460, 44, ring_w=3)
    d.text(84, 438, 240, "Log Miso's dose", size=19, weight=700)
    d.text(84, 463, 240, 'Apoquel · 16 mg', size=13, color='sub')
    d.circle(346, 452, 36, fill='track')
    d.icon('close', 336, 442, size=20, color='ink')
    label(24, 504, 'When')
    d.box(24, 524, 342, 46, fill='track', r=14)
    d.box(28, 528, 167, 38, fill='white', r=11, shadow={'opacity': 8, 'size': 6, 'distance': 1})
    d.text(28, 528, 167, 'Now · 6:02 pm', size=14, weight=700, align='center', h=38,
           valign='center')
    d.text(195, 528, 167, 'Earlier', size=14, weight=600, color='sub', align='center', h=38,
           valign='center')
    label(24, 590, 'Amount')
    d.box(24, 610, 342, 58, fill='white', r=14, stroke='border')
    for cx, ic in [(56, 'minus'), (334, 'plus')]:
        d.circle(cx, 639, 40, fill='track')
        d.icon(ic, cx - 11, 628, size=22, color='ink')
    d.text(80, 610, 230, '1 tablet', size=17, weight=700, align='center', h=58, valign='center')
    d.icon('plus', 24, 690, size=18, color='accent')
    d.text(46, 688, 260, 'Add a note (optional)', size=14, weight=700, color='accent')
    button(24, 724, 342, 54, 'Log dose', icon='check')
    d.text(24, 790, 342, 'Next dose: tomorrow at 6:00 pm', size=12, color='sub', align='center')


def community():
    d.text(24, 64, 300, 'Community', size=26, weight=800, track=-10)
    d.box(16, 104, 358, 42, fill='track', r=14)
    d.box(20, 108, 114, 34, fill='white', r=11, shadow={'opacity': 8, 'size': 6, 'distance': 1})
    for i, t in enumerate(['Feed', 'Lost pets', 'Groups']):
        d.text(20 + i * 117, 108, 114, t, size=14, weight=700 if i == 0 else 600,
               color='ink' if i == 0 else 'sub', align='center', h=34, valign='center')
    d.circle(222, 116, 8, fill='danger', stroke='track', sw=1.5)
    card(16, 162, 358, 314, r=22, shadow=True)
    d.photo(P('lost-dog'), 24, 170, 342, 150, r=16)
    pill(34, 180, 'Lost nearby · 0.8 km', 'white', 'ink', icon='map-marker')
    d.text(32, 332, 320, 'Have you seen Hazel?', size=19, weight=700)
    d.text(32, 358, 324, 'Brown spaniel mix, red collar. Last seen near Parc Hermitage, 2 h ago.',
           size=13, color='sub', lead=19, h=40)
    for i, pet in enumerate(['luna', 'pepper', 'miso']):
        d.photo(P(f'{pet}-face'), 32 + i * 16, 404, 22, 22, shape='ellipse', stroke='white', sw=2)
    d.text(90, 404, 260, '14 neighbours are looking', size=12, weight=600, color='sub', h=22,
           valign='center')
    button(32, 418 + 14, 196, 40, "I've seen her", icon='eye', size=14, r=12)
    button(236, 418 + 14, 122, 40, 'Share', 'ghost', icon='share-variant', size=14, r=12)
    card(16, 492, 358, 300, r=22)
    d.photo(P('community-post'), 28, 504, 36, 36, shape='ellipse')
    d.text(74, 504, 220, 'Sara & Nala', size=14, weight=700)
    d.text(74, 522, 220, 'Labradoodle · 2 h', size=12, color='sub')
    d.text(28, 552, 330, 'Nala graduated puppy class today! Best girl.', size=14, lead=20)
    d.photo(P('community-post'), 28, 582, 334, 196, r=16)
    tab_bar(3)


# ---------------------------------------------------------------- cover + system

def cover():
    d.spread = 0
    d.ox = d.oy = 0
    d.box(0, 0, BW, BH, fill='board')
    d.photo(P('welcome-hero'), 48, 60, 360, 480, r=32,
            shadow={'opacity': 18, 'size': 36, 'distance': 12})
    for pet, cx, cy, dia in [('biscuit', 404, 108, 104), ('miso', 56, 300, 92),
                             ('luna', 392, 470, 86), ('pepper', 92, 548, 96)]:
        avatar(pet, cx, cy, dia, ring_w=6)
    d.photo('../frontend/assets/logo-mark.png', 480, 64, 56, 56, r=14, stroke='border')
    d.text(548, 70, 300, 'PawPawCare', size=18, weight=800, color='accent')
    d.text(548, 94, 300, 'App redesign · mockups v1', size=13, color='sub')
    d.text(480, 150, 380, 'Lively\n& Light', size=64, weight=800, lead=66, track=-25, h=176)
    d.text(480, 318, 360, 'Real cats and dogs, warm pet colours and one clear next step '
           'on every screen. Built in DesignCraft from docs/redesign-prompt.md.',
           size=15, color='sub', lead=22, h=90)
    principles = [('paw', 'peach', 'Real pets wherever they help'),
                  ('numeric-1-circle', 'sky', 'One question, one action per screen'),
                  ('palette', 'rose', 'Pet colours for identity, brown for actions'),
                  ('hand-heart', 'leaf', 'Calm, no-shame health nudges')]
    for i, (ic, c, t) in enumerate(principles):
        y = 410 + i * 50
        icon_chip(ic, 480, y, 38, f'{c}-bg', f'{c}-fg')
        d.text(530, y, 320, t, size=15, weight=600, h=38, valign='center')
    d.box(48, 636, 784, 1, fill='faint')
    label(48, 656, 'In this deck', w=300)
    names = ['02 Design system', '03 Welcome', '04 Add pet · species', '05 Add pet · name',
             '06 Add pet · done', '07 Home · all good', '08 Home · attention', '09 Home · empty',
             '10 Pets', '11 Pet profile', '12 Health', '13 Log a dose', '14 Community']
    for i, n in enumerate(names):
        d.text(48 + (i // 5) * 270, 680 + (i % 5) * 24, 260, n, size=14, weight=600)
    label(48, 816, 'Photos · Unsplash licence', w=400)
    d.text(48, 836, 784,
           'Shayna Douglas (Biscuit) · Amber Kipp (Miso) · Anton Ponomarenko (Luna) · Milli '
           '(Pepper) · Anusha Barwa (welcome) · Bill Stephan, Alvan Nee (species) · Patrick Slade '
           '(empty state) · Krista Mangulsone (success) · Tamas Pap (community) · Jamie Street '
           '(lost pet)', size=11, color='sub', lead=16, h=40)


def system():
    d.spread = 1
    d.ox = d.oy = 0
    d.box(0, 0, BW, BH, fill='board')
    label(48, 48, '02 · Foundations', color='accent', w=300)
    d.text(48, 68, 500, 'Design system', size=28, weight=800, track=-10)
    # brand
    label(48, 124, 'Brand & neutrals (unchanged)', w=380)
    for i, (n, hx) in enumerate([('accent', '#8a5300'), ('ink', '#241a0e'), ('sub', '#6f604c'),
                                 ('bg', '#fffaf6'), ('border', '#eee2d3'), ('track', '#f3ead9')]):
        x = 48 + i * 64
        d.box(x, 146, 54, 54, fill=n, r=14, stroke='border')
        d.text(x - 4, 206, 62, n, size=11, weight=700, align='center')
        d.text(x - 4, 221, 62, hx, size=10, color='sub', align='center')
    label(48, 256, 'Pet identity pairs (new) · never for actions', w=400)
    for i, (c, n) in enumerate([('peach', 'Peach'), ('sky', 'Sky'), ('leaf', 'Leaf'),
                                ('rose', 'Rose'), ('lav', 'Lavender')]):
        x = 48 + i * 76
        icon_chip('paw', x + 6, 278, 56, f'{c}-bg', f'{c}-fg', size=26)
        d.text(x - 4, 340, 76, n, size=11, weight=700, align='center')
    label(48, 376, 'Status · shown once, icon + word', w=400)
    x = 48
    for lab, bg, fg, ic in [('Overdue', 'dangerTint', 'dangerText', 'alert-circle'),
                            ('Due soon', 'warnTint', 'warnText', 'clock-outline'),
                            ('All good', 'successTint', 'success', 'check-circle')]:
        x += pill(x, 398, lab, bg, fg, icon=ic) + 10
    label(48, 448, 'Buttons', w=300)
    d.ox, d.oy = 0, 0
    button(48, 470, 200, 50, 'Primary', icon='check')
    button(258, 470, 130, 50, 'Ghost', 'ghost')
    button(48, 530, 120, 40, 'Tint', 'tint', size=14, r=12)
    d.text(184, 530, 200, 'Text link', size=14, weight=700, color='accent', h=40, valign='center')
    label(48, 594, 'Pet avatar · photo + identity ring', w=380)
    for i, pet in enumerate(['biscuit', 'miso', 'luna', 'pepper']):
        avatar(pet, 84 + i * 84, 650, 60)
    label(48, 710, 'Progress · goal gradient', w=300)
    seg = (340 - 18) / 4
    for i in range(4):
        d.box(48 + i * (seg + 6), 734, seg, 8, fill='ringOk' if i < 3 else 'track', r=4)
    label(48, 768, 'Depth', w=300)
    d.text(48, 788, 360, 'One soft shadow (y 6, blur 18, 9% warm brown) on hero and photo cards '
           'only. Everything else keeps the 1px border.', size=13, color='sub', lead=19, h=60)
    # type
    x0 = 480
    label(x0, 124, 'Type · Plus Jakarta Sans', w=360)
    ty = 146
    for txt, size, weight, note in [('Biscuit', 36, 800, 'display 36/800 · new, pet names on photos'),
                                    ('Your pets', 26, 800, 'screen title 26/800'),
                                    ('Rabies booster', 19, 700, 'card title 19/700'),
                                    ('Heartworm chew', 15, 600, 'row title 15/600'),
                                    ('Apoquel · 1 tablet with food', 14, 400, 'body 14/400'),
                                    ('Biscuit · Thu 16 Oct', 12, 400, 'secondary 12/400')]:
        d.text(x0, ty, 360, txt, size=size, weight=weight, lead=size * 1.2, track=-10 if size > 20 else 0)
        ty += size * 1.2 + 2
        d.text(x0, ty, 360, note, size=11, color='subtle')
        ty += 26
    label(x0, ty, 'Section label 11/700 caps', w=360)
    ty += 40
    label(x0, ty, 'Care tile', w=300)
    card(x0, ty + 22, 175, 72, r=18)
    icon_chip('needle', x0 + 12, ty + 38, 40, 'peach-bg', 'peach-fg')
    d.text(x0 + 62, ty + 37, 110, 'Health', size=14, weight=700)
    d.text(x0 + 62, ty + 58, 110, 'Booster overdue', size=12, weight=600, color='dangerText')
    label(x0, ty + 116, 'Filter chip with face', w=300)
    d.box(x0, ty + 138, 112, 40, fill='white', r=20, stroke='controlBorder', sw=1.5)
    d.photo(P('miso-face'), x0 + 6, ty + 144, 28, 28, shape='ellipse')
    d.text(x0 + 40, ty + 138, 70, 'Miso', size=14, weight=600, h=40, valign='center')
    d.text(500, 892, 348, 'PawPawCare · Lively & Light · mockups v1 · Oct 2026', size=11,
           color='subtle')


# ---------------------------------------------------------------- deck

BOARDS = [
    (3, 'Onboarding', 'Welcome', 'Is this the app that will look after my pets?', [
        (350, 250, 'Aesthetic-usability effect',
         'A real cat and dog sharing a moment makes the first second warm, and pretty feels easier to use.'),
        (372, 640, 'One message',
         'A single value proposition. Features wait until after sign-up (progressive disclosure).'),
        (366, 755, "Hick's law + Fitts's law",
         'One filled button in the thumb zone. Sign-in is a quiet text link, so there is no 50/50 choice.'),
    ], welcome, True),
    (4, 'Onboarding', 'Add pet · species', 'What kind of pet is this?', [
        (366, 115, 'Goal-gradient effect',
         'A 3-step bar shows the end is close, which raises completion of short flows.'),
        (350, 152, 'One question per screen',
         'Working memory holds one decision at a time. Breed, age and weight are not asked here.'),
        (366, 330, 'Picture superiority',
         'Big photos are recognised faster than words. Selection is a 3px brown border + check.'),
        (366, 767, 'Thumb-zone CTA',
         'Continue sits in the same place on every step, so muscle memory carries the flow.'),
    ], add_pet_species),
    (5, 'Onboarding', 'Add pet · name', "What's their name?", [
        (273, 282, 'Endowment effect',
         'Adding a photo first makes the pet profile feel like theirs, which raises commitment to finish.'),
        (366, 449, 'Smart defaults',
         'Focused field, keyboard up, and breed suggestions to tap instead of typing (recognition over recall).'),
        (366, 609, 'Reduce anxiety',
         'Optional fields say so, and the note promises nothing is permanent, so fear of mistakes drops.'),
    ], add_pet_name),
    (6, 'Onboarding', 'Add pet · done', 'Did it work, and what now?', [
        (229, 398, 'Peak-end rule',
         'The flow ends on a happy cat-and-dog photo and a calm success mark, not a form. No confetti.'),
        (374, 590, 'Zeigarnik effect',
         'Two small open tasks invite the next step while motivation is high.'),
        (300, 655, 'Effort labels',
         'Time estimates ("~1 min") make the next step feel cheap, so more people start it.'),
    ], add_pet_done, True),
    (7, 'Home', 'Home · all good', 'Is everyone OK, and what do I do next?', [
        (300, 100, 'Status in one sentence',
         'The headline answers the question before any card is read. The streak is gentle, with no loss threat.'),
        (358, 240, 'Goal-gradient effect',
         '"3 of 4 done" with segments, so the last task feels close and satisfying to finish.'),
        (358, 365, 'One primary action',
         'Up Next is one task with one brown button. Snooze is always one tap away (autonomy).'),
        (374, 520, 'Recognition over recall',
         'Pets are photos tinted in their own colour, recognised before the name is read.'),
        (374, 695, 'Chunking by time',
         'Only what is coming up, max 5 rows, grouped by when rather than by type.'),
    ], home_ok),
    (8, 'Home', 'Home · needs attention', 'What needs me today?', [
        (185, 217, 'Von Restorff effect',
         'Red appears once on the whole screen, on the one overdue item, so it cannot be missed or diluted.'),
        (370, 252, 'No-shame framing',
         '"Let\'s get Biscuit\'s booster booked" instead of "You missed". Guilt drives app deletion, not vet visits.'),
        (358, 365, 'Shortest path to done',
         'The CTA is the real-world action (Book vet), and "Already done" closes it in one tap.'),
        (374, 610, 'Sorted by urgency',
         'Due-soon first, then later items. Status is icon + word, never colour alone.'),
    ], home_attention),
    (9, 'Home', 'Home · empty', 'What do I do first?', [
        (313, 262, 'Empty state as onboarding',
         'A sleepy kitten replaces a blank screen, and the space feels welcoming instead of broken.'),
        (366, 410, 'Effort estimate',
         '"Less than a minute" lowers the perceived cost of starting.'),
        (366, 521, 'Single CTA',
         'One thing to do, in brand brown, in the middle of the eye path.'),
        (330, 617, 'Value before effort',
         'Three concrete benefits show what the user gets for adding a pet.'),
    ], home_empty),
    (10, 'Pets', 'Pets', 'Which pet do I want to check on?', [
        (183, 250, 'Identity colour',
         'Each pet owns a colour pair used everywhere it appears, so it is recognised in peripheral vision.'),
        (374, 336, 'Status once, icon + word',
         'One line per pet, colour-blind safe. Pets needing attention come first.'),
        (374, 652, 'Low-pressure add',
         'Adding is a quiet outline tile, not a loud banner competing with the pets.'),
    ], pets_list),
    (11, 'Pets', 'Pet profile', 'How is Biscuit doing today?', [
        (195, 325, 'Emotional anchor',
         'A full-bleed photo with the name in display type, so the profile feels like a friend, not a record.'),
        (374, 76, 'Danger out of reach',
         'Leave pet, revoke links and report lost live behind the overflow menu and a confirm dialog.'),
        (374, 470, 'Most-frequent task first',
         'Today\'s routine with inline Done buttons, 1 tap per task.'),
        (374, 668, 'Progressive disclosure',
         'About 10 stacked sections become 4 summary tiles, each one number deep. Detail is one tap away.'),
    ], pet_profile, True),
    (12, 'Health', 'Health', "What's due, and when?", [
        (374, 132, 'Filter by face',
         'Pet photos as filter chips, recognised faster than names and great for multi-pet homes.'),
        (110, 278, 'Grouped by time',
         'Today / This week / Later matches how people plan, not how the database stores records.'),
        (255, 330, 'Plain-language dates',
         '"was due Fri 10 Oct" and "in 8 days" instead of raw statuses or ISO dates.'),
        (374, 712, 'Thumb-zone FAB',
         'Add record floats at the bottom right, where one-handed thumbs reach.'),
    ], health_hub),
    (13, 'Health', 'Log a dose', 'Did Miso get her pill?', [
        (366, 547, 'Smart defaults',
         '"Now" and "1 tablet" are pre-filled, so logging takes two taps: open, Log dose.'),
        (206, 698, 'Optional stays hidden',
         'Notes are collapsed behind a text link. Fewer fields means fewer abandoned logs.'),
        (290, 798, 'Closure feedback',
         'Showing the next dose confirms the plan, so nobody needs to remember it.'),
    ], log_dose),
    (14, 'Community', 'Community', "What's happening with pets nearby?", [
        (366, 245, 'Serial-position effect',
         'A nearby lost pet always tops the feed, where attention is highest.'),
        (250, 415, 'Ethical social proof',
         'Only in Community ("14 neighbours are looking"), never to pressure health decisions.'),
        (358, 452, 'Warm urgency',
         'A clear single action without alarm-red panic. Seeing a pet is one tap away.'),
    ], community),
]


def build(out):
    d.cmd('document.preferences', {'horizontalUnits': 'points', 'verticalUnits': 'points'})
    for n, hx in SWATCHES.items():
        d.swatch(n, hx)
    cover()
    system()
    for num, group, title, q, callouts, fn, *light in BOARDS:
        board(num, group, title, q, callouts, fn, bool(light and light[0]))
    d.cmd('file.save', {})
    d.save(out)


if __name__ == '__main__':
    build(sys.argv[1])
