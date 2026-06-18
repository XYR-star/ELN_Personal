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
    $Response->setContent($App->render('ideas.html', array(
        'pageTitle' => $App->getLang() === 'zh_CN' ? '灵感' : 'Ideas',
        'hideTitle' => true,
    )));
} catch (AppException $e) {
    $Response = $e->getResponseFromException($App);
} catch (Exception $e) {
    $Response = $App->getResponseFromException($e);
} finally {
    $Response->send();
}
