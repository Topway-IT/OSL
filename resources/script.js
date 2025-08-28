/**
 * This file is part of the MediaWiki extension OSLRef.
 *
 * OSLRef is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * OSLRef is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with OSLRef. If not, see <http://www.gnu.org/licenses/>.
 *
 * @file
 * @author
 * @copyright
 */

// eslint-disable-next-line no-implicit-globals, no-undef
OSLRef = ( function () {
    var SMWFunctions = {
        search_smw: (jseditor_editor, input) => {
            jseditor_editor.unhandled_input = true; // mark started user input
            if (jseditor_editor.watched_values) console.log("Watched: " + jseditor_editor.watched_values);
            var query = mwjson.schema.getAutocompleteQuery(jseditor_editor.schema, input);
            
            for (const key in jseditor_editor.watched_values) {
                if (jseditor_editor.watched[key]) {
                    query = query.replaceAll('{{$(' + key + ')}}', '{{' + jseditor_editor.watched[key].replace("root.","") + '}}');
                }
                if (jseditor_editor.watched_values[key] === undefined) query = query.replace('$(' + key + ')', encodeURIComponent('+'));
                query = query.replaceAll('$(' + key + ')', jseditor_editor.watched_values[key]);
            }

            //create a copy here since we add addition properties
            var jsondata = mwjson.util.deepCopy(jseditor_editor.jsoneditor.getValue());
            jsondata['_user_input'] = input; 
            jsondata['_user_input_lowercase'] = input.toLowerCase(); 
            jsondata['_user_input_normalized'] = mwjson.util.normalizeString(input); 
            jsondata['_user_input_normalized_tokenized'] = mwjson.util.normalizeAndTokenizeString(input); 
            jsondata['_user_lang'] = jseditor_editor.jsoneditor.options.user_language; 
            var template = Handlebars.compile(query);
            query = template(jsondata);

            // detect direct inserted UUID patterns
            const uuid_regex = /([a-f0-9]{8})(_|-| |){1}([a-f0-9]{4})(_|-| |){1}([a-f0-9]{4})(_|-| |){1}([a-f0-9]{4})(_|-| |){1}([a-f0-9]{12})/gm;
            const matches = input.match(uuid_regex);
            if (matches && matches.length) {
                let uuidQuery = ""
                for (const match of matches) uuidQuery += "[[HasUuid::" + match.replace(uuid_regex, `$1-$3-$5-$7-$9`) + "]]OR";
                uuidQuery = uuidQuery.replace(/OR+$/, ''); // trim last 'OR'
                query = query.replace(query.split('|')[0], uuidQuery); // replace filter ([[...]]) before print statements (|?...)
            }

            var result_property = mwjson.schema.getAutocompleteResultProperty(jseditor_editor.schema);
            //console.log("Search with schema: " + query);
            var url = mw.config.get("wgScriptPath") + `/api.php?action=ask&query=${query}`;
            if (!url.includes("|limit=")) url += "|limit=100";
            url += "&format=json";

            return new Promise(resolve => {
                //min input len = 0
                if (input.length < 0) {
                    return resolve([]);
                }
                console.log("Query-URL: " + url);
                fetch(url)
                    .then(response => response.json())
                    .then(data => {
                        //convert result dict to list/array
                        var resultList = []
                        if (data.error) {
                            jseditor_editor.unhandled_input = false;
                            console.warn("Error while fetching autocomplete data: ", data.error)
                        }
                        else if (jseditor_editor.unhandled_input === false) {
                            //aborted in the meantime
                            //console.log("Autocomplete request aborted in the meantime")
                        }
                        else {
                            resultList = Object.values(data.query.results); //use subjects as results
                            if (result_property) { //use objects as results
                                resultList = [];
                                Object.values(data.query.results).forEach(result => {
                                    resultList = resultList.concat(result.printouts[result_property])
                                });
                                resultList = [...new Set(resultList)]; //remove duplicates
                            }
                            //filter list
                            /*resultList = resultList.filter(result => {
                                return mwjson.util.normalizeString(JSON.stringify(result)).includes(mwjson.util.normalizeString(input)); //slow but generic
                            });*/
                            //sort list
                            resultList.sort((a, b) => input.length/b.displaytitle.length - input.length/a.displaytitle.length)
                        }
                        resolve(resultList);
                    });
            });
        },
        renderResult_smw: (jseditor_editor, result, props) => {
            if (!result.printouts) return "";
            // normalize multilanguage printouts (e. g. description)
            result = mwjson.util.normalizeSmwMultilangResult(result, jseditor_editor.jsoneditor.options.user_language);

            var previewTemplate = mwjson.util.deepCopy(mwjson.schema.getAutocompletePreviewTemplate(jseditor_editor.schema)); //use custom value
            if (previewTemplate.type.shift() === 'handlebars') {
                if (previewTemplate.type[0] === 'wikitext') previewTemplate.value = previewTemplate.value.replaceAll("\\{", "&#123;").replaceAll("\\}", "&#125;"); //escape curly-brackets with html entities. ToDo: Do this once for the whole schema
                var template = Handlebars.compile(previewTemplate.value);
                previewTemplate.value = template({ result: result });
                if (previewTemplate.type[0] === 'wikitext') previewTemplate.value = previewTemplate.value.replaceAll("&#123;", "{").replaceAll("&#125;", "}");
            }

            if (previewTemplate.type.shift() === 'wikitext') {
            var renderUrl = mw.config.get("wgScriptPath") + '/api.php?action=parse&format=json&text=';
                renderUrl += encodeURIComponent(previewTemplate.value);
                previewTemplate.value = "";
            new Promise(resolve => {
                fetch(renderUrl)
                    .then(response => response.json())
                    .then(data => {
                        //console.log("Parsed: " + data.parse.text);
                        //console.log("ID = " + props.id);
                        $("#" + props.id).append($(data.parse.text['*']));
                        //resolve(data.parse.text);
                    });
            });
            }
            return `
            <li ${props}>${previewTemplate.value}
            </li>`;
        },
        getResultValue_smw: (jseditor_editor, result) => {
            var label = result.fulltext;
            if (result.displaytitle && result.displaytitle !== "") label = result.displaytitle;
            var labelTemplate = mwjson.util.deepCopy(mwjson.schema.getAutocompleteLabelTemplate(jseditor_editor.schema)); //use custom value
            if (labelTemplate.type.shift() === 'handlebars') {
                label = Handlebars.compile(labelTemplate.value)({ result: result });
            }
            return label;
        },
        onSubmit_smw: (jseditor_editor, result) => {
            console.log("Selected: " + result.displaytitle + " / " + result.fulltext);
            var result_value = result.fulltext;
            var storeTemplate = mwjson.util.deepCopy(mwjson.schema.getAutocompleteStoreTemplate(jseditor_editor.schema)); //use custom value
            if (storeTemplate && storeTemplate.type.shift() === 'handlebars') {
                result_value = Handlebars.compile(storeTemplate.value)({ result: result });
            }
            //jseditor_editor.value = result_value;
            /*jseditor_editor.setValue(result_value);
            jseditor_editor.input.value_id = result_value;
            jseditor_editor.onChange(true);*/
            jseditor_editor.unhandled_input = false; // mark finalized user input
            mwjson.util.setJsonEditorAutocompleteField(jseditor_editor, result_value, result.printouts.label[0]);
            //jseditor_editor.input.value_label = result.printouts.label[0];
            
            if (jseditor_editor.schema?.options?.autocomplete?.field_maps) {
                for (const map of jseditor_editor.schema.options.autocomplete.field_maps) {
                    var value = mwjson.extData.getValue({result: result}, map.source_path, "jsonpath");
                    if (map.template) value = Handlebars.compile(map.template)(value);
                    var target_editor = map.target_path;
                    for (const key in jseditor_editor.watched_values) target_editor = target_editor.replace('$(' + key + ')', jseditor_editor.watched[key]);
                    if (jseditor_editor.jsoneditor.editors[target_editor]) {
                        let editor_type = jseditor_editor.jsoneditor.editors[target_editor].schema?.type;
                        if (editor_type === "array" || editor_type === "object") value = JSON.parse(value.replaceAll(/\n/g,'\\n'));
                        jseditor_editor.jsoneditor.editors[target_editor].setValue(value);
                    }
                }
            }
        },
    };
	return {
		// Hook into MwJson editor automatically
		hookIntoMwJsonEditor: function() {
			// Wait for mwjson.editor to be available
			if (typeof mwjson !== 'undefined' && mwjson.editor && mwjson.editor.prototype) {
				console.log('OSLRef: Hooking into MwJson editor...');
				
				// Check if we've already hooked
				if (mwjson.editor.prototype._oslRefHooked) {
					console.log('OSLRef: Already hooked into MwJson editor');
					return true;
				}
				
				// Store the original _onsubmit method
				const originalOnSubmit = mwjson.editor.prototype._onsubmit;
				
				// Replace with our enhanced version
				mwjson.editor.prototype._onsubmit = function(params) {
					console.log('OSLRef: Hooked into MwJson _onsubmit');
					
					// Call the original method
					const result = originalOnSubmit.call(this, params);
					
					// Add our OSL processing
					if (result && result.then) {
						result.then(() => {
							let json = params.json || this.jsoneditor.getValue();
							let meta = params.meta || {};
							
							console.log('OSLRef: Processing data for OSL', { json, meta });
							
							// Process through OSL
							if (typeof OSLRef !== 'undefined' && OSLRef.DataProcessor) {
								OSLRef.DataProcessor.processDataForOSL(json, meta, this.config);
							}
						});
					}
					
					return result;
				};
				
				// Mark as hooked to prevent double-hooking
				mwjson.editor.prototype._oslRefHooked = true;
				
				console.log('OSLRef: Successfully hooked into MwJson editor');
				return true;
			}
			return false;
		},
		
		// Initialize the hooking
		init: function() {
			console.log('OSLRef: Initializing...');
			
			// Try to hook immediately if mwjson is already available
			if (this.hookIntoMwJsonEditor()) {
				return;
			}
			
			// If not available yet, wait for it
			const checkInterval = setInterval(() => {
				if (this.hookIntoMwJsonEditor()) {
					clearInterval(checkInterval);
					clearTimeout(timeoutId);
				}
			}, 100);
			
			// Stop checking after 10 seconds
			const timeoutId = setTimeout(() => {
				clearInterval(checkInterval);
				console.log('OSLRef: Could not hook into MwJson editor after 10 seconds');
			}, 10000);
			
			// Create OSLRef editor button
			this.createOSLRefEditorButton();
		},
		
		// a button that opens OSLRef editor
		createOSLRefEditorButton: function() {
			console.log('OSLRef: Creating editor button...');
			
			// Create a simple, fixed-position button that will definitely be visible
			const createFixedButton = function() {
				console.log('OSLRef: Creating fixed-position button...');
				
				// Remove any existing buttons first
				$('.oslref-editor-btn-fixed').remove();
				
				// Create a fixed-position button that will be visible
				const fixedButton = $('<button class="btn btn-primary oslref-editor-btn-fixed" style="position: fixed; top: 50px; right: 50px; background-color: #007bff; border-color: #007bff; color: white; padding: 12px 24px; font-size: 16px; font-weight: bold; border-radius: 6px; cursor: pointer; z-index: 9999;">OSLRef Editor</button>');
				
				// Add to body
				$('body').append(fixedButton);
				
				// Add click handler
				fixedButton.on('click', function() {
					console.log('OSLRef: Fixed button clicked!');
					OSLRef.openOSLRefEditor();
				});
				
				console.log('OSLRef: Fixed button created successfully at top-right corner');
			};
			
			// Create the fixed button immediately
			createFixedButton();
			
			// Also create it after delays to ensure it appears
			setTimeout(createFixedButton, 1000);
			setTimeout(createFixedButton, 3000);
			
		},
		
		// Open OSLRef editor
		openOSLRefEditor: function() {
			console.log('OSLRef: Loading OSLRef editor...');
			
			// Load our OSLRef editor module
			mw.loader.using('ext.OSLRef.editor').then(function() {
				console.log('OSLRef: Editor module loaded successfully');
				
				// Get current page info
				const currentPage = mw.config.get('wgPageName');
				const currentNamespace = mw.config.get('wgNamespaceNumber');
				
				// Create basic editor configuration
				const config = {
					target: currentPage,
					target_namespace: currentNamespace === 0 ? '' : mw.config.get('wgCanonicalNamespace'),
					target_slot: 'jsondata',
					mode: 'default',
					popup: true,
					popupConfig: {
						msg: {
							"dialog-title": "OSLRef Editor",
							"continue": "Save",
							"cancel": "Cancel",
						}
					}
				};
				
				// Create and open the editor
				if (typeof OSLRef.editor !== 'undefined') {
					console.log('OSLRef: Creating OSLRef editor with config:', config);
					const editor = new OSLRef.editor(config);
				} else {
					console.error('OSLRef: OSLRef.editor is not defined!');
					mw.notify('OSLRef editor not available', { type: 'error' });
				}
				
			}).catch(function(error) {
				console.error('OSLRef: Failed to load editor module:', error);
				console.error('OSLRef: Error details:', error);
				mw.notify('Failed to load OSLRef editor: ' + error.message, { type: 'error' });
			});
		},
		
		util: {
			getShortUid: function() {
				return Math.random().toString(36).substr(2, 9);
			},
			OswId: function(uuid) {
				return uuid || 'new';
			},
			mergeDeep: function(target, source) {
				const result = { ...target };
				for (const key in source) {
					if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
						result[key] = this.mergeDeep(result[key] || {}, source[key]);
					} else {
						result[key] = source[key];
					}
				}
				return result;
			}
		},
		
		schema: class {
			constructor(config) {
				this.config = config;
				this.schema = config.jsonschema;
			}
			bundle() {
				return Promise.resolve();
			}
			preprocess() {
				return Promise.resolve();
			}
			getSchema() {
				return this.schema;
			}
		},
        SMW: SMWFunctions
	};
}() );

// Initialize OSLRef when the page loads
$(document).ready(function() {
	if (typeof OSLRef !== 'undefined') {
		OSLRef.init();
	}
});
