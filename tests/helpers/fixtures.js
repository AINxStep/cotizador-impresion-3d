'use strict';
// Archivos de ejemplo generados al vuelo (nada binario en el repositorio).
const { makeZip } = require('./zip.js');

const SLICE_INFO = `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <header>
    <header_item key="X-BBL-Client-Type" value="slicer"/>
    <header_item key="X-BBL-Client-Version" value="02.00.00.00"/>
  </header>
  <plate>
    <metadata key="index" value="1"/>
    <metadata key="printer_model_id" value="O1C2"/>
    <metadata key="nozzle_diameters" value="0.4"/>
    <metadata key="prediction" value="4038"/>
    <metadata key="weight" value="20.50"/>
    <metadata key="outside" value="false"/>
    <metadata key="support_used" value="false"/>
    <object identify_id="101" name="Soporte_ejemplo" skipped="false" />
    <filament id="1" tray_info_idx="GFA00" type="PLA" color="#FFFFFF" used_m="6.10" used_g="18.20" />
    <filament id="2" tray_info_idx="GFA00" type="PLA" color="#000000" used_m="0.80" used_g="2.30" />
  </plate>
  <plate>
    <metadata key="index" value="2"/>
    <metadata key="prediction" value="7200"/>
    <metadata key="weight" value="40.00"/>
    <filament id="1" tray_info_idx="GFG00" type="PETG" color="#FF0000" used_m="13.0" used_g="40.00" />
  </plate>
</config>
`;

function named(buf, name) {
  const blob = new Blob([buf]);
  blob.name = name; // importFile decide el formato por el nombre
  return blob;
}

const files = {
  'sample.gcode.3mf': () => named(makeZip([
    { name: '[Content_Types].xml', data: '<Types/>' },
    { name: '3D/3dmodel.model', data: '<model/>'.repeat(200) },
    { name: 'Metadata/slice_info.config', data: SLICE_INFO },
    { name: 'Metadata/plate_1.gcode', data: ';fake\nG1 X1 Y1\n'.repeat(500) }
  ]), 'sample.gcode.3mf'),
  // entrada sin comprimir ("stored")
  'stored.3mf': () => named(makeZip([{ name: 'Metadata/slice_info.config', data: SLICE_INFO, stored: true }]), 'stored.3mf'),
  // 3MF sin datos de laminado
  'unsliced.3mf': () => named(makeZip([
    { name: '3D/3dmodel.model', data: '<model/>' },
    { name: 'Metadata/project_settings.config', data: '{}' }
  ]), 'unsliced.3mf'),
  'bambu.gcode': () => named(Buffer.from(`; HEADER_BLOCK_START
; BambuStudio 02.00.00.00
; model printing time: 57m 40s; total estimated time: 1h 5m 12s
; total layer number: 120
; total filament length [mm] : 5230.5
; total filament volume [cm^3] : 12.58
; total filament weight [g] : 15.62
; filament_density: 1.24
; HEADER_BLOCK_END
G1 X0 Y0
`), 'bambu.gcode'),
  'orca.gcode': () => named(Buffer.from('G1 X0 Y0\n'.repeat(50) + `
; filament used [mm] = 5230.50, 120.00
; filament used [cm3] = 12.58, 0.30
; filament used [g] = 15.60, 0.40
; filament cost = 0.31, 0.01
; estimated printing time (normal mode) = 2h 3m 4s
; filament_type = PLA;PETG
`), 'orca.gcode'),
  'prusa.gcode': () => named(Buffer.from('G1 X0 Y0\n'.repeat(20) + `
; filament used [mm] = 1800.00
; filament used [g] = 5.40
; estimated printing time (normal mode) = 1d 2h 30m 15s
`), 'prusa.gcode'),
  'cura.gcode': () => named(Buffer.from(';FLAVOR:Marlin\n;TIME:3723\n;Filament used: 1.5m\nG1 X0\n'), 'cura.gcode')
};

module.exports = { fx: (name) => files[name](), SLICE_INFO };
