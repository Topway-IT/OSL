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
		_onsubmit: function(params = {}) {
		let meta = params.meta;
		let json = params.json || this.jsoneditor.getValue()
		document.activeElement.blur(); //ensure input is defocused to update final jsondata
		const promise = new Promise((resolve, reject) => {
			this.getSyntaxErrors().then((errors) => {
				if (!json) json = this.jsoneditor.getValue();
				const validation_errors = this.jsoneditor.validate();
				if (errors.length || validation_errors.length) {
					let msg = mw.message("mwjson-editor-fields-contain-error").text() + ":<br><ul>";
					for (const err of validation_errors) {
						var error_path = err.path;
						try {
							const keys = err.path.split('.'); // root
							var path = keys.shift();
							var labelPath = "";
							for (const key of keys) {
								path += "." + key;
								if (labelPath !== "") labelPath += " > ";
								var pathElement = key;
								const e = this.jsoneditor.editors[path];
								const i = Number.parseInt(key)
								if (!Number.isNaN(i)) pathElement = "Element " + (i+1).toString();
								else if (e && e.schema && e.schema.title) {
									pathElement = e.schema.title
								}
								labelPath += pathElement;
							}
							error_path = labelPath;
						} catch (error) {
							console.error("Error while generating label path: ", error);
						}
						msg += "<li>" + error_path + ": " + err.message + "</li>";
					}
					msg += "</ul>";
					if (this.config.allow_submit_with_errors) {
						msg += "<br>" + mw.message("mwjson-editor-save-anyway").text();
						mwjson.editor.prototype.confirm(msg).then((confirmed) => {
							if (confirmed) {
									if (this.config.mode !== 'query') mw.notify(mw.message("mwjson-editor-do-not-close-window").text(), { title: mw.message("mwjson-editor-saving").text() + "...", type: 'warn' });
									const submit_promise = this.config.onsubmit(json, meta);
									if (submit_promise) submit_promise.then(() => {
										resolve();
										if (this.config.mode !== 'query') mw.notify(mw.message("mwjson-editor-saved").text(), { type: 'success' });
									}).catch();
									else {
										resolve();
										if (this.config.mode !== 'query') mw.notify(mw.message("mwjson-editor-saved").text(), { type: 'success' });
									}
							} else {
								reject();
							}
						});
					}
					else {
						msg += "<br><br>" + mw.message("mwjson-editor-fix-all-errors").text();
						mwjson.editor.prototype.alert(msg).then(() => {
							reject();
						});
					}
			}
			else {
				if (this.config.mode !== 'query') mw.notify(mw.message("mwjson-editor-do-not-close-window").text(), { title: mw.message("mwjson-editor-saving").text() + "...", type: 'warn'});
				const submit_promise = this.config.onsubmit(json, meta);
					console.log(submit_promise);
					if (submit_promise) submit_promise.then(() => {
						resolve();
						if (this.config.mode !== 'query') mw.notify(mw.message("mwjson-editor-saved").text(), { type: 'success'});
					}).catch();
					else {
						resolve();
				if (this.config.mode !== 'query') mw.notify(mw.message("mwjson-editor-saved").text(), { type: 'success'});
			}
				}
		});
		});
		return promise;
		},
        SMW: SMWFunctions
	};
}() );
