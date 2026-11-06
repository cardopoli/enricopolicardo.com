// Shredder Styles for Photoshop - builds a set of trashed-type layer styles.
// Enrico Policardo - tools.  Photoshop CC 2019 or later.
//
// Run it ONCE: Photoshop > File > Scripts > Browse... and pick this file.
// It makes the grit textures (saved as patterns), builds the styles and adds them
// to your Styles panel as "Shredder - Photocopy", "Shredder - Toner skip" and so on.
//
// Then, any time: select a type layer and click a style in Window > Styles.
// The type stays live - retype it, change the font, the treatment follows.
// Bigger or smaller type? Layer > Layer Style > Scale Effects keeps the grit in proportion.
// Dark inks work best. To change the ink: double-click the "Color Overlay" effect.
//
// To keep or share them as a file: in the Styles panel select the Shredder styles
// (click the first, Shift-click the last), then the panel menu > Export Selected Styles...
#target photoshop

var INK = '1a1a1a';

// ---------------------------------------------------------------------------------
function cTID(s) { return charIDToTypeID(s); }
function sTID(s) { return stringIDToTypeID(s); }
function hexColour(hex) {
  var d = new ActionDescriptor();
  d.putDouble(cTID('Rd  '), parseInt(hex.substr(0, 2), 16));
  d.putDouble(cTID('Grn '), parseInt(hex.substr(2, 2), 16));
  d.putDouble(cTID('Bl  '), parseInt(hex.substr(4, 2), 16));
  return d;
}
function solid(hex) { var c = new SolidColor(); c.rgb.hexValue = hex; return c; }
var MODES = { normal: 'Nrml', dissolve: 'Dslv', multiply: 'Mltp', lighten: 'Lghn', screen: 'Scrn' };
function base(d, mode, opacity, hex) {
  d.putBoolean(cTID('enab'), true);
  d.putBoolean(sTID('present'), true);
  d.putBoolean(sTID('showInDialog'), true);
  d.putEnumerated(cTID('Md  '), cTID('BlnM'), cTID(MODES[mode]));
  d.putUnitDouble(cTID('Opct'), cTID('#Prc'), opacity);
  if (hex) d.putObject(cTID('Clr '), cTID('RGBC'), hexColour(hex));
  return d;
}

// --- effects ----------------------------------------------------------------------
function patternOverlay(name, scale) {
  var d = base(new ActionDescriptor(), 'normal', 100);
  var p = new ActionDescriptor(); p.putString(cTID('Nm  '), name);
  d.putObject(cTID('Ptrn'), cTID('Ptrn'), p);
  d.putUnitDouble(cTID('Scl '), cTID('#Prc'), scale);
  d.putBoolean(cTID('Algn'), true);
  var ph = new ActionDescriptor(); ph.putDouble(cTID('Hrzn'), 0); ph.putDouble(cTID('Vrtc'), 0);
  d.putObject(sTID('phase'), cTID('Pnt '), ph);
  return d;
}
function colourOverlay(hex) { return base(new ActionDescriptor(), 'lighten', 100, hex); }
function glow(inner, mode, opacity, hex, sizePx, spread, noise) {
  var d = base(new ActionDescriptor(), mode, opacity, hex);
  d.putEnumerated(cTID('GlwT'), cTID('BETE'), cTID('SfBL'));
  d.putUnitDouble(cTID('Ckmt'), cTID('#Prc'), spread);
  d.putUnitDouble(cTID('blur'), cTID('#Pxl'), sizePx);
  d.putUnitDouble(cTID('Nose'), cTID('#Prc'), noise);
  d.putUnitDouble(cTID('ShdN'), cTID('#Prc'), 0);
  d.putBoolean(cTID('AntA'), false);
  d.putUnitDouble(cTID('Inpr'), cTID('#Prc'), 50);
  if (inner) d.putEnumerated(cTID('glwS'), cTID('IGSr'), cTID('SrcE'));
  return d;
}
function shadow(hex, opacity, angle, distancePx) {
  var d = base(new ActionDescriptor(), 'multiply', opacity, hex);
  d.putBoolean(cTID('uglg'), false);
  d.putUnitDouble(cTID('lagl'), cTID('#Ang'), angle);
  d.putUnitDouble(cTID('Dstn'), cTID('#Pxl'), distancePx);
  d.putUnitDouble(cTID('Ckmt'), cTID('#Prc'), 0);
  d.putUnitDouble(cTID('blur'), cTID('#Pxl'), 0);
  d.putUnitDouble(cTID('Nose'), cTID('#Prc'), 0);
  d.putBoolean(cTID('AntA'), false);
  d.putBoolean(sTID('layerConceals'), false);   // the second colour shows through the worn spots
  return d;
}

// --- the styles -------------------------------------------------------------------
// cut = Blend If level: lighter parts of the texture above this disappear (lower = more worn)
var STYLES = [
  { name: 'Photocopy',     pattern: 'grit fine',   scale: 100, cut: 150, spray: [3, 35] },
  { name: 'Toner skip',    pattern: 'streaks',     scale: 100, cut: 135 },
  { name: 'Sandpaper',     pattern: 'grit coarse', scale: 100, cut: 128 },
  { name: 'Worn stamp',    pattern: 'blotch',      scale: 100, cut: 132, edge: [8, 85] },
  { name: 'Ink bleed',     pattern: 'grit fine',   scale: 100, cut: 205, spray: [6, 70] },
  { name: 'Dry brush',     pattern: 'fibre',       scale: 100, cut: 128, edge: [5, 70] },
  { name: 'Misregistered', pattern: 'grit fine',   scale: 150, cut: 175, second: ['ff4f3a', 90, 135, 4] },
  { name: 'Faded fax',     pattern: 'grit fine',   scale: 200, cut: 140, ink: '3a3a3a', spray: [2, 25] }
];

function effectsFor(s) {
  var fx = new ActionDescriptor();
  fx.putUnitDouble(cTID('Scl '), cTID('#Prc'), 100);
  fx.putBoolean(sTID('masterFXSwitch'), true);
  fx.putObject(sTID('patternFill'), sTID('patternFill'), patternOverlay('Shredder - ' + s.pattern, s.scale));
  fx.putObject(cTID('SoFi'), cTID('SoFi'), colourOverlay(s.ink || INK));
  if (s.edge) fx.putObject(cTID('IrGl'), cTID('IrGl'), glow(true, 'normal', 100, 'ffffff', s.edge[0], 0, s.edge[1]));
  if (s.spray) fx.putObject(cTID('OrGl'), cTID('OrGl'), glow(false, 'dissolve', s.spray[1], s.ink || INK, s.spray[0], 10, 0));
  if (s.second) fx.putObject(cTID('DrSh'), cTID('DrSh'), shadow(s.second[0], s.second[1], s.second[2], s.second[3]));
  return fx;
}

function layerRef() { var r = new ActionReference(); r.putEnumerated(cTID('Lyr '), cTID('Ordn'), cTID('Trgt')); return r; }

function applyEffects(fx) {
  var d = new ActionDescriptor(), r = new ActionReference();
  r.putProperty(cTID('Prpr'), cTID('Lefx'));
  r.putEnumerated(cTID('Lyr '), cTID('Ordn'), cTID('Trgt'));
  d.putReference(cTID('null'), r);
  d.putObject(cTID('T   '), cTID('Lefx'), fx);
  executeAction(cTID('setd'), d, DialogModes.NO);
}

// Blend interior effects as group + Blend If on This Layer: the light parts of the texture go transparent
function applyBlending(cut, withUnderlying) {
  var d = new ActionDescriptor(); d.putReference(cTID('null'), layerRef());
  var l = new ActionDescriptor();
  l.putBoolean(sTID('blendInterior'), true);
  var b = new ActionDescriptor(), ch = new ActionReference();
  ch.putEnumerated(cTID('Chnl'), cTID('Chnl'), cTID('Gry '));
  b.putReference(cTID('Chnl'), ch);
  b.putInteger(cTID('SrcB'), 0); b.putInteger(cTID('Srcl'), 0);
  b.putInteger(cTID('SrcW'), cut); b.putInteger(cTID('Srcm'), cut);
  if (withUnderlying) { b.putInteger(cTID('DstB'), 0); b.putInteger(cTID('Dstl'), 0); b.putInteger(cTID('DstW'), 255); b.putInteger(cTID('Dstt'), 255); }
  var list = new ActionList(); list.putObject(cTID('Blnd'), b);
  l.putList(cTID('Blnd'), list);
  d.putObject(cTID('T   '), cTID('Lyr '), l);
  executeAction(cTID('setd'), d, DialogModes.NO);
}

function newStyle(name, usingRef, withOptions) {
  var d = new ActionDescriptor(), r = new ActionReference();
  r.putClass(cTID('StyC'));
  d.putReference(cTID('null'), r);
  d.putString(cTID('Nm  '), name);
  d.putReference(cTID('Usng'), usingRef);
  if (withOptions) { d.putBoolean(sTID('blendOptions'), true); d.putBoolean(sTID('layerEffects'), true); }
  executeAction(cTID('Mk  '), d, DialogModes.NO);
}
// Photoshop versions differ in how they accept "New Style", so try the known forms in turn
function saveAsStyle(name, layer) {
  var byId = new ActionReference(); byId.putIdentifier(cTID('Lyr '), layer.id);
  var fx = new ActionReference(); fx.putProperty(cTID('Prpr'), cTID('Lefx')); fx.putEnumerated(cTID('Lyr '), cTID('Ordn'), cTID('Trgt'));
  var tries = [[layerRef(), true], [byId, true], [layerRef(), false], [fx, false]], last;
  for (var i = 0; i < tries.length; i++) {
    try { newStyle(name, tries[i][0], tries[i][1]); return true; } catch (e) { last = e; }
  }
  throw last;
}

// --- the textures -----------------------------------------------------------------
function definePattern(name) {
  var d = new ActionDescriptor(), r = new ActionReference();
  r.putClass(cTID('Ptrn'));
  d.putReference(cTID('null'), r);
  var u = new ActionReference();
  u.putProperty(cTID('Prpr'), sTID('selection'));
  u.putEnumerated(cTID('Dcmn'), cTID('Ordn'), cTID('Trgt'));
  d.putReference(cTID('Usng'), u);
  d.putString(cTID('Nm  '), name);
  executeAction(cTID('Mk  '), d, DialogModes.NO);
}

function patternExists(name) {
  try {
    var r = new ActionReference(); r.putProperty(cTID('Prpr'), sTID('presetManager')); r.putEnumerated(cTID('capp'), cTID('Ordn'), cTID('Trgt'));
    var list = executeActionGet(r).getList(sTID('presetManager'));
    for (var i = 0; i < list.count; i++) {
      var item = list.getObjectValue(i);
      if (list.getObjectType(i) !== cTID('PttR')) continue;
      var names = item.getList(cTID('Nm  '));
      for (var j = 0; j < names.count; j++) if (names.getString(j) === name) return true;
    }
  } catch (e) {}
  return false;
}
function makeTextures() {
  if (patternExists('Shredder - blotch')) return;      // already made on an earlier run
  var doc = app.documents.add(512, 512, 72, 'Shredder textures', NewDocumentMode.RGB, DocumentFill.WHITE);
  var layer = doc.activeLayer;
  function fresh() { doc.selection.selectAll(); doc.selection.fill(solid('808080')); doc.selection.deselect(); }
  var recipes = [
    ['grit fine',   function () { layer.applyAddNoise(60, NoiseDistribution.GAUSSIAN, true); layer.applyGaussianBlur(0.6); layer.adjustLevels(90, 170, 1, 0, 255); }],
    ['grit coarse', function () { layer.applyAddNoise(80, NoiseDistribution.GAUSSIAN, true); layer.applyGaussianBlur(2.2); layer.adjustLevels(112, 144, 1, 0, 255); }],
    ['streaks',     function () { layer.applyAddNoise(100, NoiseDistribution.GAUSSIAN, true); layer.applyMotionBlur(0, 80); layer.adjustLevels(108, 148, 1, 0, 255); }],
    ['fibre',       function () { layer.applyAddNoise(100, NoiseDistribution.GAUSSIAN, true); layer.applyMotionBlur(8, 24); layer.adjustLevels(104, 152, 1, 0, 255); }],
    ['blotch',      function () { layer.applyClouds(); layer.applyAddNoise(25, NoiseDistribution.GAUSSIAN, true); layer.applyGaussianBlur(1); layer.adjustLevels(95, 160, 1, 0, 255); }]
  ];
  for (var i = 0; i < recipes.length; i++) {
    fresh(); recipes[i][1]();
    doc.selection.selectAll(); definePattern('Shredder - ' + recipes[i][0]); doc.selection.deselect();
  }
  doc.close(SaveOptions.DONOTSAVECHANGES);
}

// --- build ------------------------------------------------------------------------
function buildStyles() {
  var doc = app.documents.add(1400, 260 * STYLES.length, 72, 'Shredder styles', NewDocumentMode.RGB, DocumentFill.WHITE);
  var made = 0, kept = [], failed = [];
  for (var i = 0; i < STYLES.length; i++) {
    var s = STYLES[i];
    var t = doc.artLayers.add(); t.kind = LayerKind.TEXT; t.name = 'Shredder - ' + s.name;
    t.textItem.contents = s.name; t.textItem.size = 150; t.textItem.position = [60, 190 + 260 * i];
    doc.activeLayer = t;
    try {
      applyEffects(effectsFor(s));
      try { applyBlending(s.cut, true); } catch (e1) { applyBlending(s.cut, false); }
    } catch (e) { failed.push(s.name + ': ' + e.message + (e.line ? ' (line ' + e.line + ')' : '')); t.remove(); continue; }
    try { saveAsStyle('Shredder - ' + s.name, t); made++; t.remove(); }
    catch (e2) { kept.push(s.name); }       // leave the styled layer so it can be added by hand
  }
  if (!kept.length) doc.close(SaveOptions.DONOTSAVECHANGES);
  return { made: made, kept: kept, failed: failed };
}

function main() {
  var fg = app.foregroundColor, bg = app.backgroundColor, units = app.preferences.rulerUnits, typeUnits = app.preferences.typeUnits;
  app.preferences.rulerUnits = Units.PIXELS; app.preferences.typeUnits = TypeUnits.PIXELS;
  app.foregroundColor = solid('000000'); app.backgroundColor = solid('ffffff');
  try {
    makeTextures();
    var r = buildStyles(), msg = '';
    if (r.made) msg += r.made + ' Shredder styles added to Window > Styles. Select a type layer and click one.\n\nTo save them as a .asl file: select them in the Styles panel, then panel menu > Export Selected Styles...';
    if (r.kept.length) msg += (msg ? '\n\n' : '') + 'This version of Photoshop would not let a script save styles, so the ' + r.kept.length + ' styled layers are waiting in the open "Shredder styles" document.\n\nFor each one: click the layer, then click the + (Create new style) at the bottom of Window > Styles, and OK. Name and settings are already there.';
    if (r.failed.length) msg += '\n\nThese did not build:\n' + r.failed.join('\n');
    alert(msg);
  } catch (e) {
    alert('Shredder Styles stopped: ' + e.message + (e.line ? ' (line ' + e.line + ')' : ''));
  } finally {
    app.foregroundColor = fg; app.backgroundColor = bg;
    app.preferences.rulerUnits = units; app.preferences.typeUnits = typeUnits;
  }
}
main();
