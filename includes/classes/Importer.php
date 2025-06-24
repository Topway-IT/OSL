<?php

/**
 * This file is part of the MediaWiki extension VisualData.
 *
 * VisualData is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * VisualData is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with VisualData.  If not, see <http://www.gnu.org/licenses/>.
 *
 * @file
 * @ingroup extensions
 * @author thomas-topway-it <support@topway.it>
 * @copyright Copyright ©2024, https://wikisphere.org
 */

namespace MediaWiki\Extension\OSLRef;

use MediaWiki\Extension\OSLRef\Aliases\Title as TitleClass;
use MediaWiki\Extension\OSLRef\Utils\SafeJsonEncoder;
use MediaWiki\Revision\SlotRecord;

class Importer {

	/** @var User */
	private $user;

	/** @var string */
	private $schemaName;

	/** @var Context */
	private $context;

	/** @var Importer|Importer1_35 */
	private $importer;

	/** @var array */
	private $options = [];

	/** @var callback */
	private $showMsg;

	/**
	 * @param User $user
	 * @param Context $context
	 * @param string $schemaName
	 * @param array|null $options []
	 */
	public function __construct( $user, $context, $schemaName, $options = [] ) {
		$this->user = $user;
		$this->context = $context;
		$this->schemaName = $schemaName;
		$this->options = $options;

		$options = [ 'main-slot', 'limit', 'category-field', 'isCsv' ];
		foreach ( $options as $value ) {
			if ( !isset( $this->options[$value] ) ) {
				$this->options[$value] = false;
			}
		}
	}

	/**
	 * @param string $pagenameFormula
	 * @param array $data
	 * @param function $showMsg
	 * @return bool|void
	 */
	public function importData( $pagenameFormula, $data, $showMsg ) {
		if ( empty( $pagenameFormula ) ) {
			$showMsg( 'no pagename formula' );
			return false;
		}

		$this->showMsg = $showMsg;
		$schema = \VisualData::getSchema( $this->context, $this->schemaName );

		if ( !$schema ) {
			$showMsg( 'generating schema' );
			// phpcs:ignore Generic.CodeAnalysis.AssignmentInCondition.Found
			if ( !( $schema = $this->createSchema( $this->schemaName, $data ) ) ) {
				$showMsg( "couldn't save schema" );
				return false;
			}
		}

		if ( !\VisualData::isList( $data ) ) {
			$data = [ $data ];
		}

		$databaseManager = new DatabaseManager();
		$submitForm = new SubmitForm( $this->user, $this->context );
		$this->importer = \VisualData::getImporter( $this->user );

		// @TODO MW 1.42
		if ( !$this->importer ) {
			return;
		}

		$n = 0;
		foreach ( $data as $key => $value ) {
			if ( $this->options['isCsv'] ) {
				$value = array_filter( $value );

				// convert array fields
				foreach ( $value as $k => $v ) {
					if ( isset( $schema['properties'][$k]['type'] ) ) {
						switch ( $schema['properties'][$k]['type'] ) {
							case 'array':
								$sep_ = preg_quote( $this->options['csv-array-field-separator'], '/' );
								$value[$k] = preg_split( "/\s*$sep_\s*/", $v, -1, PREG_SPLIT_NO_EMPTY );
								break;
						}
					}
				}
			}

			// required for the use by createArticle
			$value = DatabaseManager::castDataRec( $schema, $value );

			$flatten = $databaseManager->prepareData( $schema, $value );
			$titleText = $submitForm->replacePageNameFormula( $flatten, $pagenameFormula, $properties );

			$title_ = \VisualData::parseTitleCounter( $titleText );

			if ( !$title_ ) {
				$showMsg( 'wrong title ' . $titleText );
				continue;
			}

			$showMsg( 'saving article: ' . $title_->getFullText() );

			$pagename = $this->createArticle( $title_, $value );

			if ( $pagename === false ) {
				$showMsg( 'error creating article ' . $title_->getFullText() );
				continue;
			}

			if ( $pagename === null ) {
				$showMsg( 'article exists with no changes ' . $title_->getFullText() );
				continue;
			}

			// ***important !! get again the title object after article creation
			$title_ = TitleClass::newFromText( $pagename );

			$entries = $databaseManager->recordProperties( 'ImportData', $title_, $flatten, $errors );
			$showMsg( "$entries entries created for article $pagename" );
			$n++;
			if ( $this->options['limit'] !== false && $n === $this->options['limit'] ) {
				break;
			}
		}

		$showMsg( "$n pages imported" );
		return true;
	}

	/**
	 * @param Title|Mediawiki\Title\Title $title
	 * @param array $data
	 * @return string|null|false
	 */
	public function createArticle( $title, $data ) {
		$categories = [];
		if ( !empty( $this->options['category-field'] ) ) {
			if ( isset( $data[$this->options['category-field']] ) ) {
				$categories = $data[$this->options['category-field']];
			}
			unset( $data[$this->options['category-field']] );
		}

		$obj = [
			'schemas' => [
				$this->schemaName => $data
			]
		];

		// merge existing (json-data) categories
		if ( $title->isKnown() ) {
			$categories_ = \VisualData::getCategories( $title );
			$categories = array_unique( array_merge( $categories_, $categories ) );
		}

		if ( !empty( $categories ) ) {
			$obj['categories'] = $categories;
		}

		if ( $title->isKnown() ) {
			$deep_sort = static function ( &$arr ) use ( &$deep_sort ) {
				foreach ( $arr as &$value ) {
					if ( is_array( $value ) ) {
						$deep_sort( $value );
					}
				}
				ksort( $arr );
				sort( $arr );
			};

			$nestedArraysEqual = static function ( array $a, array $b ) use ( &$deep_sort ) {
				$deep_sort( $a );
				$deep_sort( $b );
				return ( $a === $b );
			};

			$obj_ = \VisualData::getJsonData( $title );
			if ( $obj_ && $nestedArraysEqual( $obj_, $obj ) ) {
				return null;
			}
		}

		$encoder = new SafeJsonEncoder( $this->showMsg, JSON_PRETTY_PRINT );

		try {
			$encodedObj = $encoder->encode( $obj );

		} catch ( Exception $e ) {
			call_user_func( $this->showMsg, "error, json_encode failed: " . $e->getMessage() );
			return false;
		}

		$contents = [
			[
				'role' => $this->options['main-slot'] ? SlotRecord::MAIN : SLOT_ROLE_VISUALDATA_JSONDATA,
				'model' => CONTENT_MODEL_VISUALDATA_JSONDATA,
				'text' => $encodedObj
			],
		];

		if ( !$this->options['main-slot'] ) {
			array_unshift( $contents, [
				'role' => SlotRecord::MAIN,
				'model' => 'wikitext',
				'text' => ''
			] );
		}

		$pagename = $title->getFullText();

		try {
			$this->importer->doImportSelf( $pagename, $contents );

		} catch ( \Exception $e ) {
			call_user_func( $this->showMsg, "error: $pagename " . $e->getMessage() );
			call_user_func( $this->showMsg, "warning: $pagename import 2nd attempt" );

			// $lb = MediaWikiServices::getInstance()->getDBLoadBalancer();
			// $dbw = $lb->getConnection( DB_PRIMARY );

			// if ( $dbw->trxStatus() == TransactionManager::STATUS_TRX_ERROR ) {
			// 	$dbw->rollback( __METHOD__ );
			// }

			// @FIXME *sometimes* this is required and it works
			// however is not clear *why*
			try {
				$this->importer->doImportSelf( $pagename, $contents );
			} catch ( \Exception $e ) {
				call_user_func( $this->showMsg, "error: $pagename " . $e->getMessage() );
			}
		}

		return $pagename;
	}

}
