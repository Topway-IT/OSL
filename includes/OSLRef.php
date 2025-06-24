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
 * @author 
 * @copyright 
 */

class OSLRef {
	public static function initialize() {
	}

	/**
	 * @copyright https://www.mediawiki.org/wiki/Extension:VisualData
	 * @param User|null $user
	 * @param User|null $user
	 * @return Importer|Importer1_35|null
	 */
	public static function getImporter( $user = null ) {
		$services = MediaWikiServices::getInstance();

		if ( version_compare( MW_VERSION, '1.42', '>=' ) ) {
			include_once __DIR__ . '/importer/VisualDataImporter1_42.php';

			if ( !$user ) {
				if ( defined( 'MW_ENTRY_POINT' ) && MW_ENTRY_POINT === 'cli' ) {
					$user = User::newSystemUser( 'Maintenance script', [ 'steal' => true ] );
				} else {
					$user = RequestContext::getMain()->getAuthority();
				}
			}

			// @see WikiImporterFactory.php -> getWikiImporter
			return new VisualDataImporter1_42(
				// performer
				$user,
				$services->getMainConfig(),
				$services->getHookContainer(),
				$services->getContentLanguage(),
				$services->getNamespaceInfo(),
				$services->getTitleFactory(),
				$services->getWikiPageFactory(),
				$services->getWikiRevisionUploadImporter(),
				$services->getContentHandlerFactory(),
				$services->getSlotRoleRegistry()
			);

		} elseif ( version_compare( MW_VERSION, '1.37', '>=' ) ) {
			include_once __DIR__ . '/importer/VisualDataImporter.php';

			// @see ServiceWiring.php -> WikiImporterFactory
			return new VisualDataImporter(
				$services->getMainConfig(),
				$services->getHookContainer(),
				$services->getContentLanguage(),
				$services->getNamespaceInfo(),
				$services->getTitleFactory(),
				$services->getWikiPageFactory(),
				$services->getWikiRevisionUploadImporter(),
				$services->getPermissionManager(),
				$services->getContentHandlerFactory(),
				$services->getSlotRoleRegistry()
			);
		}

		include_once __DIR__ . '/importer/VisualDataImporter1_35.php';
		return new VisualDataImporter1_35( $services->getMainConfig() );
	}

}
