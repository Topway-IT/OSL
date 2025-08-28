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

use MediaWiki\Extension\OSLRef\Aliases\Title as TitleClass;


class OSLRefHooks {

	/**
	 * @param array $credits
	 * @return void
	 */
	public static function initExtension( $credits = [] ) {
	}

	/**
	 * @param Parser $parser
	 */
	public static function onParserFirstCallInit( Parser $parser ) {
	}

	/**
	 * @param DatabaseUpdater|null $updater
	 */
	public static function onLoadExtensionSchemaUpdates( ?DatabaseUpdater $updater = null ) {
	}

	/**
	 * @param OutputPage $outputPage
	 * @param Skin $skin
	 * @return void
	 */
	public static function onBeforePageDisplay( OutputPage $outputPage, Skin $skin ) {
		$title = $outputPage->getTitle();
		$outputPage->addModules( 'ext.OSLRef' );
	}

	/**
	 * @param Title|Mediawiki\Title\Title &$title
	 * @param null $unused
	 * @param OutputPage $output
	 * @param User $user
	 * @param WebRequest $request
	 * @param MediaWiki $mediaWiki
	 * @return void
	 */
	public static function onBeforeInitialize(
		&$title,
		$unused,
		OutputPage $output,
		User $user,
		WebRequest $request,
		/* MediaWiki|MediaWiki\Actions\ActionEntryPoint */ $mediaWiki
	) {
		\OSLRef::initialize();
	}

	/**
	 * @param Skin $skin
	 * @param array &$bar
	 * @return void
	 */
	public static function onSkinBuildSidebar( $skin, &$bar ) {
		$links = [];

		foreach ( $links as $key => $value ) {
			$title_ = TitleClass::newFromText( "OSLRef:$value" );
			$bar[ wfMessage( 'oslref-sidepanel-section' )->text() ][] = [
				'text'   => wfMessage( "oslref-sidepanel-$key" )->text(),
				'href'   => $title_->getLocalURL()
			];
		}
	}

	/**
	 * @param array &$vars
	 * @param string $skin
	 * @param Config $config
	 * @return void
	 */
	public static function onResourceLoaderGetConfigVars( &$vars, $skin, $config ) {
		$vars['wgOSLRefEditorConfig'] = [
			'debug' => $config->get( 'DebugToolbar' ),
			'apiUrl' => wfScript( 'api' ),
		];
	}
}
