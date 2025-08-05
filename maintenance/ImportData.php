<?php

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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with OSLRef.  If not, see <http://www.gnu.org/licenses/>.
 *
 * @file
 * @ingroup extensions
 * @author thomas-topway-it <support@topway.it>
 * @copyright Copyright ©2025, https://wikisphere.org
 */

use MediaWiki\Extension\OSLRef\Aliases\Title as TitleClass;
use MediaWiki\MediaWikiServices;
use MediaWiki\Revision\SlotRecord;

$IP = getenv( 'MW_INSTALL_PATH' );
if ( $IP === false ) {
	$IP = __DIR__ . '/../../..';
}

require_once "$IP/maintenance/Maintenance.php";

class ImportData extends Maintenance {

	public function __construct() {
		parent::__construct();
		$this->addDescription( 'import data' );
		$this->requireExtension( 'OSLRef' );
	}

	/**
	 * @inheritDoc
	 */
	public function execute() {
		$delete = $this->getOption( 'delete' ) ?? false;
		$user = User::newSystemUser( 'Maintenance script', [ 'steal' => true ] );
		$services = MediaWikiServices::getInstance();
		$services->getUserGroupManager()->addUserToGroup( $user, 'bureaucrat' );

		$importer = \OSLRef::getImporter();
		$error_messages = [];
		$context = RequestContext::getMain();
		$title = SpecialPage::getTitleFor( 'Badtitle' );
		$context = RequestContext::getMain();
		$context->setTitle( $title );
		$context->setUser( $user );

		// Group files by page name first
		$pageSlots = [];

		$import = null; // Declare first for recursion

		$import = static function ( $namespace, $path, $relPath = '' ) use ( &$error_messages, $context, $importer, &$import ) {

			$files = scandir( $path );
			foreach ( $files as $file ) {
				if ( $file === '.' || $file === '..' || strpos( $file, '.' ) === 0 ) {
					continue;
				}
				$filePath_ = "$path/$file";

				if ( is_dir( $filePath_ ) ) {

					// A recurse into subdirectory, append to relPath
					$import( $namespace, $filePath_, $relPath === '' ? $file : "$relPath/$file" );

				} elseif ( is_file( $filePath_ ) ) {
					// Split filename into base and slot/model
					$parts = explode( '.', $file, 3 );
					$baseName = $parts[0];
					$slot = $parts[1] ?? '';
					$contentModel = $parts[2] ?? '';

					// Let Map content models to MediaWiki content models
					if ( $contentModel === 'lua' ) {
						$contentModel = 'Scribunto';
					}

					//  slots degined using $wgWSSlotsDefinedSlots
					switch ( $slot ) {
						case 'slot_main':
							$slotRole = SlotRecord::MAIN;
							break;

						case 'slot_header': 
							$slotRole = 'header';
							break;

						case 'slot_footer': 
							$slotRole = 'footer';
							break;

						case 'slot_jsondata':
							$slotRole = 'jsondata';
							break;

						default:
							$slotRole = str_replace( 'slot_', '', $slot );
					}

					$content = file_get_contents( $filePath_ );

					$contents = [
						[
							'role' => $slotRole,
							'model' => $contentModel,
							'text' => $content
						]
					];

					if ( $slotRole !== SlotRecord::MAIN ) {
						array_unshift( $contents, [
							'role' => SlotRecord::MAIN,
							'model' => 'wikitext',
							'text' => ''
						] );
					}

					// let build full page name with submodule support
					$pagePath = $relPath === '' ? $baseName : "$relPath/$baseName";
					// For Module namespace, keep / for sub-modules, otherwise use :
					if ( $namespace === 'Module' ) {
						$fullPageName = "$namespace:$pagePath";
					} else {
						$pagePath = str_replace( '/', ':', $pagePath );
						$fullPageName = "$namespace:$pagePath";
					}

					echo "importing $fullPageName". PHP_EOL;
					// print_r($contents);

					try {
						$title_ = TitleClass::newFromText( $fullPageName );
						$context->setTitle( $title_ );
						$importer->doImportSelf( $fullPageName, $contents );
						
						// Debug: Check slots after import
						$wikiPage = new WikiPage($title_);
						$revisionRecord = $wikiPage->getRevisionRecord();
						$slots = $revisionRecord->getSlots()->getSlots();
						echo "DEBUG Import - Available slots after import for '$fullPageName': ";
						var_dump(array_keys($slots));

						// --- SLOT FIX: Ensure latest revision has all non-main slots ---
						$slotRoles = [ 'jsondata', 'header', 'footer' ];
						$services = MediaWikiServices::getInstance();
						$slotRoleRegistry = $services->getSlotRoleRegistry();
						$revisionStore = $services->getRevisionStore();
						$latestRev = $revisionRecord;
						$latestRevId = $latestRev->getId();
						foreach ( $slotRoles as $roleName ) {
							if ( !$latestRev->hasSlot( $roleName ) ) {
								// Walk back to find most recent revision with this slot
								$prevRev = $revisionStore->getPreviousRevision( $latestRev );
								while ( $prevRev ) {
									if ( $prevRev->hasSlot( $roleName ) ) {
										$content = $prevRev->getContent( $roleName );
										// Add the slot to the latest revision
										$user = User::newSystemUser( 'Import Script', [ 'steal' => true ] );
										$pageUpdater = $wikiPage->newPageUpdater( $user );
										$pageUpdater->setContent( $roleName, $content );
										$pageUpdater->saveRevision( CommentStoreComment::newUnsavedComment( 'Restored missing slot' ), EDIT_SUPPRESS_RC );
										echo "Restored missing slot '$roleName' for $fullPageName\n";
										break;
									}
									$prevRev = $revisionStore->getPreviousRevision( $prevRev );
								}
							}
						}
						// --- END SLOT FIX ---

						echo ' (success)' . PHP_EOL;

					} catch ( \Exception $e ) {
						echo '***error ' . $e->getMessage();
						$error_messages[$pagePath] = $e->getMessage();

					}
				}
			}
		};

		$dirPath = __DIR__ . '/../data';
		$namespaces = [ 'Category', 'File', 'Item', 'Module', 'JsonSchema', 'Property', 'Template' ];

		foreach ( [ 'base', 'core' ] as $repo ) {
			foreach ( $namespaces as $namespace ) {
				$import( $namespace, "$dirPath/$repo/$namespace" );
			}
		}

		// Import all slots for each page in one call
		foreach ( $pageSlots as $pageName => $slots ) {
			echo "importing $pageName" . PHP_EOL;
			
			// Ensure main slot is present if we have non-main slots
			$hasMainSlot = false;
			foreach ( $slots as $slot ) {
				if ( $slot['role'] === SlotRecord::MAIN ) {
					$hasMainSlot = true;
					break;
				}
			}
			
			if ( !$hasMainSlot && count( $slots ) > 0 ) {
				array_unshift( $slots, [
					'role' => SlotRecord::MAIN,
					'model' => 'wikitext',
					'text' => ''
				] );
			}
			
			try {
				$title_ = TitleClass::newFromText( $pageName );
				$context->setTitle( $title_ );
				$importer->doImportSelf( $pageName, $slots );
				
				// Debug: Check slots after import
				$wikiPage = new WikiPage($title_);
				$revisionRecord = $wikiPage->getRevisionRecord();
				$actualSlots = $revisionRecord->getSlots()->getSlots();
				echo "DEBUG Import - Available slots after import for '$pageName': ";
				var_dump(array_keys($actualSlots));
				
				echo ' (success)' . PHP_EOL;
				
			} catch ( \Exception $e ) {
				echo '***error ' . $e->getMessage();
				$error_messages[$pageName] = $e->getMessage();
			}
		}

		if ( count( $error_messages ) ) {
			echo '(OSLRef) ***error importing ' . count( $error_messages ) . ' articles' . PHP_EOL;
			foreach ( $error_messages as $pagename => $message ) {
				echo "Failed to import: $pagename - Error: $message" . PHP_EOL;
			}
		}
	}
}

/**
 * Extract page name from file path
 * Improved to handle the OSW UUID naming pattern
 */
function extractPageName( $file, $namespace, $relPath ) {
	// Split by first dot to get the base name (OSW UUID)
	$parts = explode( '.', $file, 2 );
	$baseName = $parts[0];
	
	// For files in subdirectories, construct the full path
	$pagePath = $relPath === '' ? $baseName : "$relPath/$baseName";
	
	// For Module namespace, keep / for sub-modules, otherwise use :
	if ( $namespace === 'Module' ) {
		$fullPageName = "$namespace:$pagePath";
	} else {
		$pagePath = str_replace( '/', ':', $pagePath );
		$fullPageName = "$namespace:$pagePath";
	}
	
	return $fullPageName;
}

/**
 * Extract slot data from file
 * Improved to handle the slot naming pattern
 */
function extractSlotData( $file, $filePath ) {
	// Split by dots to get parts: baseName.slot_type.contentModel
	$parts = explode( '.', $file, 3 );
	
	if ( count( $parts ) < 2 ) {
		return null; // Invalid file format
	}
	
	$slot = $parts[1] ?? '';
	$contentModel = $parts[2] ?? '';

	// Map content models to MediaWiki content models
	if ( $contentModel === 'lua' ) {
		$contentModel = 'Scribunto';
	}
	if ( $contentModel === 'svg' ) {
		$contentModel = 'wikitext'; // SVG files should be treated as wikitext
	}

	// slots defined using $wgWSSlotsDefinedSlots
	switch ( $slot ) {
		case 'slot_main':
			$slotRole = SlotRecord::MAIN;
			break;

		case 'slot_header': 
			$slotRole = 'header';
			break;

		case 'slot_footer': 
			$slotRole = 'footer';
			break;

		case 'slot_jsondata':
			$slotRole = 'jsondata';
			break;

		default:
			$slotRole = str_replace( 'slot_', '', $slot );
	}

	$content = file_get_contents( $filePath );

	return [
		'role' => $slotRole,
		'model' => $contentModel,
		'text' => $content
	];
}

$maintClass = ImportData::class;
require_once RUN_MAINTENANCE_IF_MAIN;
