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

		$import = static function ( $namespace, $path ) use ( &$error_messages ) {
			$files = scandir( $path );
			foreach ( $files as $file ) {
				if ( $file === '.' || $file === '..' ) {
					continue;
				}
				$filePath_ = "$path/$file";

				if ( is_dir( $filePath_ ) ) {
					$import( $filePath_, $callback );

				} elseif ( is_file( $filePath_ ) ) {				
					[ $pagename, $slot, $contentModel ] = explode( '.', $file, 3 );

					// slots degined using $wgWSSlotsDefinedSlots
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

					try {
						$title_ = TitleClass::newFromText( "$namespace:$pagename" );
						$context->setTitle( $title_ );
						$importer->doImportSelf( $pagename, $contents );
						echo ' (success)' . PHP_EOL;

					} catch ( Exception $e ) {
						echo ' ( ***error)' . PHP_EOL;
						$error_messages[$pagename] = $e->getMessage();
					}
					
				}
			}
		};

		$dirPath = __DIR__ . '/../data';
		$namespaces = [ 'Category', 'File', 'Item', 'Module', 'JsonSchema', 'Property', 'Template' ];

		foreach ( [ 'base', 'core' ] ) {		
			foreach ( $namespaces as $namepace ) {
				$import( $namepace, "$dirPath/$namepace" );
			}
		}

		if ( count( $error_messages ) ) {
			print_r( $error_messages );
			echo '(OSLRef) ***error importing ' . count( $error_messages ) . ' articles' . PHP_EOL;
		}
	}
}

$maintClass = ImportData::class;
require_once RUN_MAINTENANCE_IF_MAIN;
