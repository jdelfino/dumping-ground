var GLOBAL_LOG_LEVEL = 0

function make_all_notes() {
  var today = new Date();
  var dd = today.getDate();
  var mm = today.getMonth()+1; 
  var yy = today.getYear();
  
  var ss = SpreadsheetApp.getActiveSpreadsheet()
  var name = 'Te Araroa Trail Notes ' + mm + '-' + dd + '-' + yy
  var target_sheet = ss.getSheetByName(name)
  if(!target_sheet){
    target_sheet = ss.insertSheet(name);
  }

  prep_sheet_(target_sheet)
  
  all_regions = get_region_list_()
  for(var i = 0; i < all_regions.length; i++){
    info_("Processing region " + all_regions[i])
    
    urls = get_trail_index_(all_regions[i])
    
    info_("Region " + all_regions[i] + " has " + urls.length + " trail sections")
    
    for(var j = 0; j < urls.length; j++) {
      info_("Processing trail: " + urls[j])
      sections = make_sections_()
      get_trail_details_(urls[j], sections)
      dump_rows_(sections, target_sheet)
      SpreadsheetApp.flush()
    }
  }
  finish_sheet_(target_sheet)
}

function get_region_list_() {
  return ['northland', 'auckland', 'waikato', 'whanganui', 'manawatu', 'wellington', 'nelsonmarlborough', 'canterbury', 'otago', 'southland']
}

function make_sections_() { 
  var sections = {}
  sections['Section Name'] = ''
  sections['Northern Start'] = '';
  sections['Southern End'] = '';
  sections['Distance'] = '';
  sections['Time'] = '';
  sections['Tramping Standard'] = '';
  sections['Description'] = '';
  sections['Potential Hazards'] = '';
  sections['Extra Info'] = '';
  sections['Requirements'] = '';
  sections['Environment'] = '';
  sections['Amenities (Start)'] = '';
  sections['Amenities (On Route)'] = '';
  sections['Amenities (End)'] = '';
  sections['Closest Town(s)'] = '';
  sections['Bypass'] = '';
  return sections;
}

// SCRAPE & PARSE SITE 

function get_trail_links_(row_div){
  // extract the link for non-closed trails
  child_divs = row_div.getElements('div')
  var rval = []
  for(var i = 0; i < child_divs.length; i += 2) {
    if(child_divs[i+1].getElement('a')) {
      rval.push(child_divs[i+1].getElement('a').getAttribute('href').getValue())
    }
  }
  return rval
}

function get_trail_index_(region_name){
  // get a list of urls for the individual trail notes for a region
  var xml = UrlFetchApp.fetch('http://www.teararoa.org.nz/' + region_name + '/').getContentText()
  var xmlDoc = Xml.parse(xml, true);
  var html = xmlDoc.getElement().getElement('body')
  var row_divs = get_div_(html, 
                         ['id', 'class', 'class', 'class', 'id', 'id', 'class'], 
                         ['main', 'container', 'trail-region', 'tab-content', 'trail-index', 'trail-index-body', 'row']);
  
  links = []
  for(var i = 0; i < row_divs.length; i++){
    links.push.apply(links, get_trail_links_(row_divs[i]))
  }
  return links              
}

function sanitize_(xmlstring){
  // instead of fancier processing of html tags, just sanitize_ a big old xml string
  // strip the xml header and most html tags out.  smartly convert <br> and lists
  var rval = xmlstring.replace(/<br (clear="none")?\/>/g, '\n')
  rval = rval.replace(/<li>\s*/g, '*')
  rval = rval.replace(/\s*<\/li>\s*/g, ' ')
  rval = rval.replace(/&amp;/g, '&')
  rval = rval.replace(/(\r?\n)(\r?\n)*/g, '\n')
  // blindly strip all other tags
  rval = rval.replace(/<[^>]*>/g, '')
  return rval
}

function extract_text_(elem){
  // concat the text and sub-elements from an xml element
  // a bit hacky, doesn't maintain order, but works for the case we care about
  var text = elem.getText()
  var elems = elem.getElements()
  for(var i = 0; i < elems.length; i++){
    text += sanitize_(elems[i].toXmlString())
  }
  return text.trim()
}

function extract_sections_(row_divs, info_map){
  // pull the sections out of a tab from an individual trail notes page
  for(var i = 0; i < row_divs.length; i++) {
    var row_children = row_divs[i].getElements('div')
    var heading = extract_text_(row_children[0]).replace('\n', ' ').replace(' (North to South)', '')
    if(!(heading in info_map)){
      continue
    }
    
    var body = extract_text_(row_children[1])
    info_map[heading] = body
  }

}

function get_trail_details_(url, info_map){
  // parse the details for an individual trail notes page into info_map
  var xml = UrlFetchApp.fetch(url).getContentText()
  var xmlDoc = Xml.parse(xml, true);
  var html = xmlDoc.getElement().getElement('body')
  
  var parent_div = get_div_(html, 
                           ['id', 'class', 'class'], 
                           ['main', 'container', 'trail-region']);
  var header = parent_div[0].getElement('h2')
  section_name = extract_text_(header)
        
  if(ends_with_(section_name, 'CLOSED')){
    debug_("Trail " + url + " is CLOSED")
    bypass_div = get_div_(parent_div[0], 
                         ['class', 'class'], 
                         ['row', 'span10'])
    info_map['Bypass'] = extract_text_(bypass_div[0])
    info_map['Section Name'] = section_name.slice(0, -9) // strip off ' - CLOSED'
    return
  }

  info_map['Section Name'] = section_name.slice(0, -7) // strip off ' - OPEN'

  // getting to this the normal way is too hard, just regex it out
  xml_string = parent_div[0].toXmlString()
  maps = xml_string.match(/map\d\d\d/)
  if(maps != null){
    info_map['Maps'] = maps.join(',')
  }
  
  var row_divs = get_div_(html, 
                         ['id', 'class', 'class', 'id', 'id', 'class', 'class'], 
                         ['main', 'container', 'trail-region', 'track-details', 'trail-notes', 'row-divider', 'row']);

  extract_sections_(row_divs, info_map)

  row_divs = get_div_(html, 
                     ['id', 'class', 'class', 'id', 'id', 'class', 'class'], 
                     ['main', 'container', 'trail-region', 'track-details', 'additional-information', 'row-divider', 'row']);
  extract_sections_(row_divs, info_map)
  
  return info_map
}


// DUMP TO SPREADSHEET FUNCTIONS

function push_if_full_(prefix, text, target_sheet) {
  var trimmed = text.trim()
  if(trimmed){ 
    target_sheet.appendRow(['','','','', prefix + trimmed]);
  }
}

function dump_rows_(sections, target_sheet) {
  // given a sections map, turn it into rows on a spreadsheet
  debug_("Dumping row: " + sections['Section Name'])
  
  var first_row = target_sheet.getLastRow();

  if(sections['Bypass']){
    target_sheet.appendRow(['','','','',sections['Section Name'] + ' is CLOSED.  Bypass trail: ' + sections['Bypass']])

  } else {
    // sometimes time goes into distance...
    var distance = '?'
    var hours = '?'
    if(sections['Distance'].match(/days|hours/)) {
      distance = '?'
      hours = time_to_hours_(sections['Distance'].trim());
    } else {
      distance = parse_distance_(sections['Distance'])
      hours = time_to_hours_(sections['Time'].trim());
    }

    row1 = []
    row1.push(distance);
    row1.push('cum km placeholder')
    row1.push(hours)
    row1.push('cum hours placeholder')
    row1.push(sections['Section Name'] +
              '\n[Maps]: ' + sections['Maps'] +
              '; [Start]: ' + sections['Northern Start'] + 
              '; [End]: ' + sections['Southern End'] + 
              '; [Track type]: ' + sections['Tramping Standard'])
    if(sections['Requirements'] || sections['Environment']){
      row1[row1.length-1] += '\n[Requirements]: ' + sections['Requirements'] + ' ' + sections['Environment'];
    }
    target_sheet.appendRow(row1)
    var last_row = target_sheet.getLastRow()
    range = target_sheet.getRange(last_row, 2);
    range.setFormulaR1C1('SUM(R1C[-1]:R[0]C[-1])');
    range = target_sheet.getRange(last_row, 4);
    range.setFormulaR1C1('SUM(R1C[-1]:R[0]C[-1])');
    
    push_if_full_('', sections['Description'], target_sheet);
    push_if_full_('Extra: ', sections['Extra Info'], target_sheet);
    push_if_full_('Hazards: ', sections['Potential Hazards'], target_sheet);

    amenities = ''
    if(sections['Amenities (Start)']) {
      amenities += ' [Start]: ' + sections['Amenities (Start)']
    }
    if(sections['Amenities (On Route)']) {
      amenities += ' [On Route]: ' + sections['Amenities (On Route)']
    }
    if(sections['Amenities (End)']) {
      amenities += ' [End]: ' + sections['Amenities (End)']
    }
    push_if_full_('Amenities ', amenities, target_sheet)

    push_if_full_('Closest Town(s): ', sections['Closest Town(s)'], target_sheet);
  }
  
  format_section_(target_sheet, first_row)
}

function format_section_(target_sheet, first_row){
  var last_row = target_sheet.getLastRow();
  range = target_sheet.getRange(first_row+1, 1, last_row-first_row, 5);
  range.setBorder(true, true, true, true, true, false);
}

function prep_sheet_(target_sheet){
  // clear out the sheet, set column widths, etc
  target_sheet.clear()
  target_sheet.appendRow(['km','cum. km', 'hrs', 'cum. hrs', 'Route info']);
  target_sheet.setColumnWidth(1, 22);
  target_sheet.setColumnWidth(2, 38);
  target_sheet.setColumnWidth(3, 22);
  target_sheet.setColumnWidth(4, 38);
  target_sheet.setColumnWidth(5, 840);
  max_cols = target_sheet.getMaxColumns()
  if(max_cols > 5){
    target_sheet.deleteColumns(6, target_sheet.getMaxColumns()-5)
  }
  max_rows = target_sheet.getMaxRows()
  if(max_rows > 1){
    target_sheet.deleteRows(2, target_sheet.getMaxRows()-1)
  }
}

function finish_sheet_(target_sheet){
  range = target_sheet.getRange(2, 1, target_sheet.getLastRow(), target_sheet.getLastColumn())
  range.setFontSize(8);
}

// GENERAL UTILITIES
function ends_with_(str, suffix) {
    return str.indexOf(suffix, str.length - suffix.length) !== -1;
}

function parse_fraction_(frac){
  // parse a string fraction into a float
  var y = frac.split(' ');
  if(y.length > 1){
    var z = y[1].split('/');
    return +y[0] + (z[0] / z[1])
  }
  else{
    var z = y[0].split('/');
    if(z.length > 1){
      return z[0] / z[1];
    }
    else {
      return z[0];
    }
  }
}

function time_to_hours_(time_str) {
  // parse a time string into number of hours, converting from days if necessary
  regexp = /([\d \.\/]*)(?!.*\d)/
  match = regexp.exec(time_str);

  var val = parse_fraction_(match[0].trim());
  
  if(ends_with_(time_str, 'days')) {
    val *= 8; 
  }
  if(ends_with_(time_str, 'day')) {
    val *= 8; 
  }
  debug_("time to hours: " + time_str + "::::" + val);
  return val;
}

function parse_distance_(distance_text){
  // parse a distance into kms

  extract = /\s*(\d*)\s*(km|m|kilometres)?/
  match = extract.exec(distance_text)
  
  var rval = ''
 
  if(match){
    if(match[2] == 'm') {
      rval = parseFloat(match[1]) / 1000;
    } else {
      rval = parseFloat(match[1]);
    }
  }

  if(isNaN(rval)) {
    rval = ''
  }
  debug_("parse distance: " + distance_text + "::::" + rval)
  return rval
}

// XML HELPERS 
function get_div_(xml, attr_names, attr_values){
  // extract one or more divs that exist along a path specified by attr_names and attr_values
  // attr_names is the name of the attributes used to filter
  // attr_values is a parallel array containing the attribute values used to filter
  
  //debug_("get_div_ " + attr_names + ":::" + attr_values)
  var results = []
  
  var divs = xml.getElements('div')
  for(var j = 0; j < divs.length; j++){
    var attr = divs[j].getAttribute(attr_names[0])

    if(attr && (attr.getValue() == attr_values[0])){
      if(attr_names.length == 1) {
        results.push(divs[j])
      } else {
        var tmp_res = get_div_(divs[j], attr_names.slice(1), attr_values.slice(1))
        results.push.apply(results, tmp_res)
      }
    }
  }
  return results
}

function print_children_(xml){
  var children = xml.getElements()
  for(var i = 0; i < children.length; i++){
    Logger.log('CHILDREN of ' + xml.getName().getLocalName() + ': ' + children[i].getName().getLocalName())
  }
}

function print_attrs_(xml){ 
  var attrs = xml.getAttributes()
  for(var i = 0; i < attrs.length; i++){
    Logger.log('ATTRS of ' + xml.getName().getLocalName() + ': ' + attrs[i].getName().getLocalName() + ':::' + attrs[i].getValue())    
  }
}

// LOGGING
var DEBUG = 0
var INFO = 3
var ERROR = 6

function debug_(args){
  log_(DEBUG, args)
}

function info_(args){
  log_(INFO, args)
}

function error_(args){
  log_(ERROR, args)
}

function log_(level, msg) {
  if (level >= GLOBAL_LOG_LEVEL) {
    Logger.log(msg)
  }
};