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

    $path = (string) $Request->query->get('path', '/api/meta');
    if (!str_starts_with($path, '/api/')) {
        throw new Exception('Invalid planner API path');
    }

    $body = $Request->getContent();
    $headers = "Content-Type: application/json\r\n";
    $context = stream_context_create(array(
        'http' => array(
            'method' => $Request->getMethod(),
            'header' => $headers,
            'content' => $body,
            'ignore_errors' => true,
            'timeout' => 15,
        ),
    ));

    $plannerApiBase = rtrim((string) (getenv('PLANNER_API_BASE') ?: 'http://planner:4044'), '/');
    $result = file_get_contents($plannerApiBase . $path, false, $context);
    if ($result === false) {
        throw new Exception('Planner API unavailable');
    }

    $status = 200;
    foreach ($http_response_header ?? array() as $header) {
        if (preg_match('/^HTTP\/\S+\s+(\d+)/', $header, $matches)) {
            $status = (int) $matches[1];
            break;
        }
    }

    $Response->setStatusCode($status);
    $Response->headers->set('Content-Type', 'application/json; charset=utf-8');
    $Response->headers->set('Cache-Control', 'no-store');
    $Response->setContent($result);
} catch (AppException $e) {
    $Response = $e->getResponseFromException($App);
} catch (Exception $e) {
    $Response->setStatusCode(400);
    $Response->headers->set('Content-Type', 'application/json; charset=utf-8');
    $Response->setContent(json_encode(array('error' => $e->getMessage()), JSON_THROW_ON_ERROR));
} finally {
    $Response->send();
}
