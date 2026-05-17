<!DOCTYPE html>
<html lang="pt-br">

<head>
    <meta charset="UTF-8">
    <title>Resultado</title>
    <link rel="stylesheet" href="./style2.css">
</head>

<body>
    <?php
    // Recebendo os dados (usando os nomes corretos do formulário)
    $horas = $_POST['txhoras'];
    $valorHora = $_POST['txvalor'];

    // Realizando o cálculo (variáveis em minúsculo conforme definidas)
    $salario = $horas * $valorHora;

    // Exibindo o resultado
    echo "O resultado é: R$ " . $salario;
    ?>
</body>

</html>