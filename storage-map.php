<?php

declare(strict_types=1);

namespace Elabftw\Elabftw;

use Elabftw\Exceptions\AppException;
use Exception;
use Symfony\Component\HttpFoundation\Response;

require_once 'app/init.inc.php';

$Response = new Response();

try {
    $Response->prepare($Request);
    $Response->setContent($App->render('storage-map.html', array(
        'pageTitle' => '可视化存放',
        'storageMapLang' => $App->getLang(),
        'initialItemId' => (int) $Request->query->get('item_id', 0),
    )));
    $Response->headers->set('Cache-Control', 'no-store, max-age=0');
    $Response->headers->set('Pragma', 'no-cache');
} catch (AppException $e) {
    $Response = $e->getResponseFromException($App);
} catch (Exception $e) {
    $Response = $App->getResponseFromException($e);
} finally {
    $Response->send();
}
