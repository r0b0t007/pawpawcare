"""Tiny DesignCraft script generator.

Emits `command.id {json}` lines for `designcraft-cli script`, tracking step
indices so later commands can reference earlier results via `$N.id`.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
MCI = json.load(open(os.path.join(HERE, '..', '_mci.json')))


def glyph(name):
    return chr(MCI[name])


class Doc:
    def __init__(self):
        self.lines = []
        self.styles = {}
        self.swatches = {}
        self.spread = 0
        self.ox = 0  # local→spread offset for the current board
        self.oy = 0

    # -- plumbing -------------------------------------------------------
    def cmd(self, cid, params=None):
        self.lines.append(f"{cid} {json.dumps(params or {}, ensure_ascii=False)}")
        return len(self.lines) - 1

    @staticmethod
    def ref(step):
        return f"${step}.id"

    def save(self, path):
        with open(path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(self.lines) + '\n')

    # -- colour ---------------------------------------------------------
    def swatch(self, name, hexcolor):
        if name not in self.swatches:
            self.cmd('swatch.create', {'name': name, 'color': hexcolor})
            self.swatches[name] = hexcolor
        return name

    # -- geometry helpers -------------------------------------------------
    def _rect(self, x, y, w, h):
        return [x + self.ox, y + self.oy, x + self.ox + w, y + self.oy + h]

    def frame(self, x, y, w, h, shape='rectangle', content='unassigned', text=None):
        p = {'spread': self.spread, 'rect': self._rect(x, y, w, h), 'shape': shape,
             'content': content}
        if text is not None:
            p['text'] = text
        return self.cmd('frame.create', p)

    def box(self, x, y, w, h, fill=None, r=0, stroke=None, sw=1, shape='rectangle',
            shadow=None, opacity=None, gradient=None, name=None):
        s = self.frame(x, y, w, h, shape=shape)
        ids = [self.ref(s)]
        if fill:
            self.cmd('object.fill', {'swatch': fill, 'ids': ids})
        if gradient:
            self.cmd('object.gradient', dict(gradient, ids=ids))
        self.cmd('object.stroke', {'swatch': stroke or '[None]', 'weight': sw, 'align': 'inside', 'ids': ids})
        if r:
            self.cmd('object.cornerOptions', {'shape': 'rounded', 'size': r, 'ids': ids})
        if shadow:
            self.cmd('object.dropShadow', dict({'on': True, 'distance': 4, 'angle': -90,
                                                'opacity': 10, 'size': 16,
                                                'color': 'shadow'}, **shadow, ids=ids))
        if opacity is not None:
            self.cmd('object.opacity', {'opacity': opacity, 'ids': ids})
        if name:
            self.cmd('object.rename', {'id': self.ref(s), 'name': name})
        return s

    def circle(self, cx, cy, d, **kw):
        return self.box(cx - d / 2, cy - d / 2, d, d, shape='ellipse', **kw)

    def photo(self, path, x, y, w, h, r=0, shape='rectangle', stroke=None, sw=1, shadow=None):
        s = self.frame(x, y, w, h, shape=shape, content='graphic')
        ids = [self.ref(s)]
        self.cmd('place.load', {'path': path})
        self.cmd('place.drop', {'spread': self.spread, 'x': x + self.ox, 'y': y + self.oy,
                                'frame': self.ref(s)})
        self.cmd('object.fit', {'mode': 'fillProportionally', 'ids': ids})
        if r:
            self.cmd('object.cornerOptions', {'shape': 'rounded', 'size': r, 'ids': ids})
        self.cmd('object.stroke', {'swatch': stroke or '[None]', 'weight': sw, 'align': 'inside', 'ids': ids})
        if shadow:
            self.cmd('object.dropShadow', dict({'on': True, 'distance': 6, 'angle': -90,
                                                'opacity': 14, 'size': 20,
                                                'color': 'shadow'}, **shadow, ids=ids))
        return s

    # -- type -----------------------------------------------------------
    WEIGHTS = {400: 'Regular', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold'}

    def style(self, size, weight=400, color='ink', align='left', lead=None, track=0,
              family='Plus Jakarta Sans', caps=False, name=None):
        key = (size, weight, color, align, lead, track, family, caps)
        if key in self.styles:
            return self.styles[key]
        fstyle = self.WEIGHTS.get(weight, 'Regular') if family == 'Plus Jakarta Sans' else 'Regular'
        nm = name or f"{'icon' if family != 'Plus Jakarta Sans' else 'text'}/{size}-{weight}-{color}-{align[0]}{'-c' if caps else ''}{'-t' + str(track) if track else ''}"
        chars = {'fontFamily': family, 'fontStyle': fstyle, 'size': size, 'fill': color,
                 'tracking': track,
                 'leading': {'kind': 'points', 'value': lead or round(size * 1.3, 1)}}
        if caps:
            chars['capitalization'] = 'allCaps'
        self.cmd('style.paragraph.create', {'name': nm, 'para': {'align': align, 'hyphenate': False},
                                            'chars': chars})
        self.styles[key] = nm
        return nm

    def text(self, x, y, w, s, size=14, weight=400, color='ink', align='left', h=None,
             lead=None, track=0, caps=False, valign='top', family='Plus Jakarta Sans'):
        lead = lead or round(size * 1.3, 1)
        if h is None:
            h = lead * (s.count('\n') + 1) + 4
        st = self.style(size, weight, color, align, lead, track, family, caps)
        f = self.frame(x, y, w, h, content='text', text=s)
        if '\n' in s:
            self.cmd('edit.selectAll')
        self.cmd('style.paragraph.apply', {'name': st, 'clearOverrides': True})
        self.cmd('object.textFrameOptions', {'inset': 0, 'verticalJustification': valign,
                                             'firstBaseline': 'ascent', 'ids': [self.ref(f)]})
        return f

    def icon(self, name, x, y, size=20, color='ink', align='center', w=None):
        w = w or size
        return self.text(x, y, w, glyph(name), size=size, color=color, align=align,
                         family='Material Design Icons', lead=size, h=size + 2)
