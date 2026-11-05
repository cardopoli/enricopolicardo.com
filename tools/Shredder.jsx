// Shredder for Photoshop - put a layer through the machine.
// Enrico Policardo - tools.  Photoshop CC 2019 or later.
//
// Install: Photoshop > File > Scripts > Browse... and pick this file
//          (or copy it into Photoshop's Presets/Scripts folder and restart: it then
//          appears under File > Scripts > Shredder).
// Use:     select a type layer (or any layer), run the script, pick a treatment.
//          The layer becomes a Smart Object with Smart Filters plus a layer mask,
//          so the words stay editable: double-click the Smart Object, edit, save.
//          Not quite right? Cmd/Ctrl+Z once and run it again - every run is a new take.
#target photoshop

var TREATMENTS = [
  { key: 'photocopy', name: 'Photocopy  (dry)' },
  { key: 'toner',     name: 'Toner skip  (dry)' },
  { key: 'sandpaper', name: 'Sandpaper  (dry)' },
  { key: 'bleed',     name: 'Ink bleed  (wet)' },
  { key: 'water',     name: 'Water damage  (wet)' },
  { key: 'slices',    name: 'Glitch slices  (shredded)' },
  { key: 'torn',      name: 'Torn strips  (shredded)' },
  { key: 'fax',       name: 'Fax drift  (shredded)' }
];

// ---------------------------------------------------------------------------------
function rnd(lo, hi) { return lo + Math.random() * (hi - lo); }
function clampN(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function px(v) { return Math.round(v * 10) / 10; }
function cTID(s) { return charIDToTypeID(s); }
function sTID(s) { return stringIDToTypeID(s); }

function layerHeight(layer) {
  var b = layer.bounds;   // [left, top, right, bottom] as UnitValues
  return Math.max(8, b[3].as('px') - b[1].as('px'));
}

function toSmartObject() { executeAction(sTID('newPlacedLayer'), undefined, DialogModes.NO); }

function addMaskFromSelection() {
  var d = new ActionDescriptor(), r = new ActionReference();
  d.putClass(cTID('Nw  '), cTID('Chnl'));
  r.putEnumerated(cTID('Chnl'), cTID('Chnl'), cTID('Msk '));
  d.putReference(cTID('At  '), r);
  d.putEnumerated(cTID('Usng'), cTID('UsrM'), cTID('RvlS'));
  executeAction(cTID('Mk  '), d, DialogModes.NO);
}

// remember and restore which layers are visible
function eachLayer(container, fn) {
  for (var i = 0; i < container.layers.length; i++) {
    var l = container.layers[i]; fn(l);
    if (l.typename === 'LayerSet') eachLayer(l, fn);
  }
}

// Build a black/white texture on a temporary layer and turn it into a selection
// (white = keep ink). `shape(tmp, u)` runs the filters that make the pattern.
function textureSelection(doc, u, shape) {
  var keep = doc.activeLayer, seen = [];
  eachLayer(doc, function (l) { seen.push([l, l.visible]); });
  var tmp = doc.artLayers.add();
  tmp.name = 'shredder texture';
  try {
    doc.selection.selectAll();
    var grey = new SolidColor(); grey.rgb.red = grey.rgb.green = grey.rgb.blue = 128;
    doc.selection.fill(grey); doc.selection.deselect();
    shape(tmp, u);
    eachLayer(doc, function (l) { if (l !== tmp) { try { l.visible = false; } catch (e) {} } });
    tmp.visible = true;
    doc.selection.load(doc.channels[0], SelectionType.REPLACE, false);   // light parts of the texture
  } finally {
    tmp.remove();
    for (var i = 0; i < seen.length; i++) { try { seen[i][0].visible = seen[i][1]; } catch (e) {} }
    doc.activeLayer = keep;
  }
}

// a grain mask: amount 0..1 = how much ink is lost, grainPx = size of the specks
function grit(tmp, u, amount, grainPx) {
  tmp.applyAddNoise(clampN(120 + amount * 200, 1, 400), NoiseDistribution.GAUSSIAN, true);
  if (grainPx > 0.4) tmp.applyGaussianBlur(px(grainPx));
  tmp.threshold(Math.round(clampN(70 + amount * 90, 1, 255)));
}

// ---------------------------------------------------------------------------------
function shred(doc, layer, key, amount) {
  var u = layerHeight(layer), a = amount / 100, seed = Math.floor(rnd(1, 999999));
  doc.activeLayer = layer;
  toSmartObject();
  var so = doc.activeLayer;
  so.name = layer.name + '  · shredded';

  if (key === 'photocopy') {
    so.applyGaussianBlur(px(clampN(u * 0.008 * (0.5 + a), 0.3, 40)));
    so.blendMode = BlendMode.DISSOLVE;                       // soft edges become broken toner
    textureSelection(doc, u, function (t) { grit(t, u, a * 0.6, u * 0.004); });
    addMaskFromSelection();
  } else if (key === 'toner') {
    textureSelection(doc, u, function (t) {
      t.applyAddNoise(400, NoiseDistribution.GAUSSIAN, true);
      t.applyMotionBlur(0, Math.round(clampN(u * 2, 10, 999)));   // long horizontal streaks
      t.applyGaussianBlur(px(clampN(u * 0.01, 0.5, 50)));
      t.threshold(Math.round(clampN(105 + a * 40, 1, 255)));
    });
    addMaskFromSelection();
  } else if (key === 'sandpaper') {
    textureSelection(doc, u, function (t) { grit(t, u, a, u * 0.002); });
    addMaskFromSelection();
  } else if (key === 'bleed') {
    so.applyGaussianBlur(px(clampN(u * 0.025 * (0.4 + a), 0.5, 120)));
    so.blendMode = BlendMode.DISSOLVE;                       // ink spreading into the paper
  } else if (key === 'water') {
    so.applyRipple(Math.round(clampN(80 + a * 500, 1, 999)), RippleSize.LARGE);
    so.applyGaussianBlur(px(clampN(u * 0.006, 0.3, 30)));
    so.opacity = 92;
  } else if (key === 'slices') {
    // square waves moving rows sideways = horizontal glitch slices
    var amp = Math.round(clampN(u * 0.4 * (0.2 + a), 2, 999));
    so.applyWave(Math.round(3 + a * 8), Math.round(clampN(u * 0.2, 1, 998)), Math.round(clampN(u * 1.2, 2, 999)),
      1, amp, 100, 1, WaveType.SQUARE, UndefinedAreas.REPEATEDGEPIXELS, seed);
  } else if (key === 'torn') {
    var ampT = Math.round(clampN(u * 0.25 * (0.2 + a), 2, 999));
    so.applyWave(Math.round(2 + a * 6), Math.round(clampN(u * 0.15, 1, 998)), Math.round(clampN(u * 0.6, 2, 999)),
      1, ampT, 1, 100, WaveType.SQUARE, UndefinedAreas.REPEATEDGEPIXELS, seed);
    textureSelection(doc, u, function (t) { grit(t, u, a * 0.25, u * 0.006); });
    addMaskFromSelection();
  } else if (key === 'fax') {
    so.applyWave(5, Math.round(clampN(u * 0.03, 1, 998)), Math.round(clampN(u * 0.08, 2, 999)),
      1, Math.round(clampN(u * 0.05 * (0.3 + a), 2, 999)), 100, 1, WaveType.TRIANGLE, UndefinedAreas.REPEATEDGEPIXELS, seed);
    so.applyGaussianBlur(px(clampN(u * 0.004, 0.3, 20)));
    so.blendMode = BlendMode.DISSOLVE;
  }
  doc.selection.deselect();
  doc.activeLayer = so;
}

// ---------------------------------------------------------------------------------
function dialog() {
  var w = new Window('dialog', 'Shredder');
  w.orientation = 'column'; w.alignChildren = ['fill', 'top']; w.spacing = 12; w.margins = 18;
  var g1 = w.add('group'); g1.add('statictext', undefined, 'Treatment');
  var list = g1.add('dropdownlist', undefined, []);
  for (var i = 0; i < TREATMENTS.length; i++) list.add('item', TREATMENTS[i].name);
  var last = parseInt($.getenv('SHREDDER_T') || '0', 10);
  list.selection = isNaN(last) ? 0 : clampN(last, 0, TREATMENTS.length - 1);
  var g2 = w.add('group'); g2.add('statictext', undefined, 'Amount');
  var slider = g2.add('slider', undefined, parseInt($.getenv('SHREDDER_A') || '55', 10), 0, 100); slider.preferredSize.width = 200;
  var val = g2.add('statictext', undefined, String(Math.round(slider.value))); val.characters = 3;
  slider.onChanging = function () { val.text = String(Math.round(slider.value)); };
  w.add('statictext', undefined, 'Every run is a new take. Not right? Cmd/Ctrl+Z, then run again.', { multiline: true });
  var b = w.add('group'); b.alignment = 'right';
  b.add('button', undefined, 'Cancel', { name: 'cancel' });
  b.add('button', undefined, 'Shred', { name: 'ok' });
  if (w.show() !== 1) return null;
  $.setenv('SHREDDER_T', String(list.selection.index)); $.setenv('SHREDDER_A', String(Math.round(slider.value)));
  return { key: TREATMENTS[list.selection.index].key, amount: Math.round(slider.value) };
}

// suspendHistory runs its code as text in the global scope, so the job is handed over here
var SHREDDER_JOB = null;
function runJob() { shred(SHREDDER_JOB.doc, SHREDDER_JOB.layer, SHREDDER_JOB.key, SHREDDER_JOB.amount); }

function main() {
  if (!app.documents.length) { alert('Open a document and select the layer to shred.'); return; }
  var doc = app.activeDocument, layer = doc.activeLayer;
  if (layer.typename !== 'ArtLayer') { alert('Select a single layer (type or pixels), not a group.'); return; }
  if (layer.isBackgroundLayer) { alert('The Background layer can\'t be shredded. Duplicate it or select another layer.'); return; }
  var choice = dialog(); if (!choice) return;
  var units = app.preferences.rulerUnits; app.preferences.rulerUnits = Units.PIXELS;
  try {
    SHREDDER_JOB = { doc: doc, layer: layer, key: choice.key, amount: choice.amount };
    doc.suspendHistory('Shredder: ' + choice.key, 'runJob()');
  } catch (e) {
    alert('Shredder stopped: ' + e.message + (e.line ? ' (line ' + e.line + ')' : '') + '\nUse Cmd/Ctrl+Z to step back if anything changed.');
  } finally {
    app.preferences.rulerUnits = units;
  }
}
main();
