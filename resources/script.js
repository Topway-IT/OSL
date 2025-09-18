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
	return {
		// Initialize OSLRef
		init: function() {
			console.log('OSLRef: Initializing...');
			
			// Create OSLRef editor button
			this.createOSLRefEditorButton();
		},
		
		// a button that opens OSLRef editor
		createOSLRefEditorButton: function() {
			console.log('OSLRef: Creating editor button...');
			
			// Try to find the page actions area and add button there
			const addButtonToPageActions = function() {
				console.log('OSLRef: Looking for page actions area...');
				
				// Remove any existing OSLRef buttons first
				$('.oslref-editor-btn').remove();
				
				// Look for common page action selectors
				const selectors = [
					'.page-actions-menu',
					'.mw-page-actions',
					'.page-actions',
					'.mw-indicators',
					'.mw-content-ltr .firstHeading',
					'#content .firstHeading'
				];
				
				let targetElement = null;
				for (const selector of selectors) {
					targetElement = $(selector);
					if (targetElement.length > 0) {
						console.log('OSLRef: Found target element:', selector);
						break;
					}
				}
				
				// If no specific page actions found, try to find the edit button and add after it
				if (!targetElement || targetElement.length === 0) {
					console.log('OSLRef: Looking for edit button...');
					const editButton = $('a[title*="Edit"], a[href*="action=edit"], .mw-editsection a').first();
					if (editButton.length > 0) {
						targetElement = editButton.parent();
						console.log('OSLRef: Found edit button parent');
					}
				}
				
				// If still no target, try to find any action area
				if (!targetElement || targetElement.length === 0) {
					console.log('OSLRef: Looking for any action area...');
					targetElement = $('.mw-content-ltr .firstHeading, #content .firstHeading').first();
				}
				
				if (targetElement && targetElement.length > 0) {
					// Create OSLRef button
					const oslrefButton = $('<span class="oslref-editor-btn" style="margin-left: 10px;"><a href="#" class="oslref-editor-link" style="background: #007bff; color: white; padding: 6px 12px; border-radius: 4px; text-decoration: none; font-size: 13px; font-weight: 500; display: inline-block; transition: background-color 0.2s ease;">OSLRef Editor</a></span>');
					
					// Add hover effect
					oslrefButton.find('a').hover(
						function() { $(this).css('background-color', '#0056b3'); },
						function() { $(this).css('background-color', '#007bff'); }
					);
					
					// Add click handler
					oslrefButton.find('a').on('click', function(e) {
						e.preventDefault();
						console.log('OSLRef: Page action button clicked!');
						OSLRef.openOSLRefEditor();
					});
					
					// Add button to target element
					targetElement.append(oslrefButton);
					console.log('OSLRef: Button added to page actions area');
				} else {
					console.log('OSLRef: Could not find suitable location for button');
					// Fallback: create a floating button
					const floatingButton = $('<div style="position: fixed; top: 20px; right: 20px; z-index: 1000;"><a href="#" class="oslref-editor-link" style="background: #007bff; color: white; padding: 10px 15px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500; display: inline-block; box-shadow: 0 2px 8px rgba(0,0,0,0.2);">OSLRef Editor</a></div>');
					
					floatingButton.find('a').on('click', function(e) {
						e.preventDefault();
						console.log('OSLRef: Floating button clicked!');
						OSLRef.openOSLRefEditor();
					});
					
					$('body').append(floatingButton);
					console.log('OSLRef: Floating button created as fallback');
				}
			};
			
			// Try to add button immediately
			addButtonToPageActions();
			
			// Also try after a delay in case page isn't fully loaded
			setTimeout(addButtonToPageActions, 1000);
			setTimeout(addButtonToPageActions, 3000);
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
					// Use the same default schema that MwJson uses
					schema: {"$ref": mw.util.getUrl("Category:Entity", {"action":"raw", "slot": "jsondata"})},
					popup: true,
					popupConfig: {
						msg: {
							"dialog-title": "OSLRef Editor",
							"continue": "Save",
							"cancel": "Cancel",
						}
					}
				};
				
				// Try to get page-specific schema from the page's type field
				// First, let's try to get the page data using OSLRef API
				if (typeof OSLRef !== 'undefined' && OSLRef.api) {
					console.log('OSLRef: Getting page data to determine schema...');
					OSLRef.api.getPage(currentPage).then((page) => {
						console.log('OSLRef: Page data received:', page);
						
						if (page.slots && page.slots.jsondata) {
							try {
								const pageData = JSON.parse(page.slots.jsondata);
								console.log('OSLRef: Parsed page data:', pageData);
								
								if (pageData.type && pageData.type.length > 0) {
									// Use the schema from the page's type field
									const typeCategory = pageData.type[0];
									config.schema = {"$ref": mw.util.getUrl(typeCategory, {"action":"raw", "slot": "jsonschema"})};
									console.log('OSLRef: Using page-specific schema from type:', typeCategory);
								}
							} catch (e) {
								console.log('OSLRef: Could not parse page data, using default schema:', e);
							}
						}
						
						// Create and open the editor with the determined schema
						if (typeof OSLRef.editor !== 'undefined') {
							console.log('OSLRef: Creating OSLRef editor with config:', config);
							const editor = new OSLRef.editor(config);
						} else {
							console.error('OSLRef: OSLRef.editor is not defined!');
							mw.notify('OSLRef editor not available', { type: 'error' });
						}
					}).catch((error) => {
						console.error('OSLRef: Failed to get page data:', error);
						// Fallback to default schema
						if (typeof OSLRef.editor !== 'undefined') {
							console.log('OSLRef: Creating OSLRef editor with default config:', config);
							const editor = new OSLRef.editor(config);
						}
					});
				} else {
					console.log('OSLRef: OSLRef.api not available, using default schema');
					// Fallback to default schema
					if (typeof OSLRef.editor !== 'undefined') {
						console.log('OSLRef: Creating OSLRef editor with default config:', config);
						const editor = new OSLRef.editor(config);
					} else {
						console.error('OSLRef: OSLRef.editor is not defined!');
						mw.notify('OSLRef editor not available', { type: 'error' });
					}
				}
				
			}).catch(function(error) {
				console.error('OSLRef: Failed to load editor module:', error);
				console.error('OSLRef: Error details:', error);
				mw.notify('Failed to load OSLRef editor: ' + error.message, { type: 'error' });
			});
		}
	};
}() );

// Initialize OSLRef when the page loads
$(document).ready(function() {
	console.log('OSLRef: Document ready, checking if OSLRef is available...');
	console.log('OSLRef: typeof OSLRef =', typeof OSLRef);
	console.log('OSLRef: Current page title =', mw.config.get('wgPageName'));
	
	if (typeof OSLRef !== 'undefined') {
		console.log('OSLRef: OSLRef is available, initializing...');
		OSLRef.init();
	} else {
		console.error('OSLRef: OSLRef is not defined! Check if the module loaded correctly.');
	}
});
